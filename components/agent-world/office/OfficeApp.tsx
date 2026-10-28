'use client';

import {useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode} from "react";
import {useRouter} from "next/navigation";
import RunNowButton from "@/components/agent-world/RunNowButton";
import OfficeDossier from "@/components/agent-world/office/OfficeDossier";
import {OfficeRoster, OfficeTicker, OfficeWall} from "@/components/agent-world/office/OfficeSidebar";
import OfficeStage, {type OfficeStageControls} from "@/components/agent-world/office/OfficeStage";
import {createOfficeSound, type OfficeSoundPlayer} from "@/components/agent-world/office/office-sound";
import {useOfficeKeys} from "@/components/agent-world/office/useOfficeKeys";
import {useClock, useLiveFeed} from "@/components/agent-world/useLiveFeed";
import ActionButton from "@/components/primitives/ActionButton";
import Badge from "@/components/primitives/Badge";
import Switch from "@/components/primitives/Switch";
import {iconButton} from "@/components/primitives/iconButton";
import {OFFICE_REPLAY_MS, POLL_LIVE_MS, WORKER_IDS, type WorkerId} from "@/lib/agent-world/config";
import {isSessionLive, liveMode} from "@/lib/agent-world/live";
import {officeClock, officeReplayDuration, officeState, replayCut, replayWindowScale, seenAfter, type CareerStats, type OfficeExtras} from "@/lib/agent-world/office";
import {OFFICE_KEY_SHORTCUTS, type OfficeIntent} from "@/lib/agent-world/office-keys";
import {OFFICE_PRESET_IDS, presetForSeat, type OfficePresetId} from "@/lib/agent-world/office-layout";
import {cuesFor} from "@/lib/agent-world/office-sounds";
import type {OfficeBudgets} from "@/lib/agent-world/office-store";
import {motionUnitMs, replayFrame, replayProgress, sessionSpan} from "@/lib/agent-world/replay";
import type {LiveView} from "@/lib/agent-world/types";
import {easternParts, marketStatus} from "@/lib/prices/market-hours";
import {AGENT_WORLD_COPY, FLOOR_COPY, KIND_COPY, STATUS_COPY} from "@/lib/learn/copy/agent-world";
import {OFFICE_COPY, OFFICE_KEYS_COPY, OFFICE_PRESET_COPY, type OfficeTermsGroup} from "@/lib/learn/copy/agent-world-office";
import {describeMarketStatus} from "@/lib/learn/copy/market";
import {cn} from "@/lib/utils";

// The office's client root: the same feed the floor polls (useLiveFeed over /api/agent-world/live),
// the clock, the replay of a finished session (60 seconds, the floor's machinery), and the office
// state read from it every tick (lib/agent-world/office.ts). It lays out the top bar, the stage, the
// wall, the roster of seats, the ticker and a seat's file, and owns the keys.

type Props = {
    initial: LiveView;
    owner: boolean;
    enabled: boolean;
    offNote: string | null;
    ratingTitle: string;
    extras: OfficeExtras;
    career: CareerStats;
    budgets: OfficeBudgets;
    nextSessionNote: string | null;
    engine: 'auto' | '2d';
    terms: Partial<Record<OfficeTermsGroup, ReactNode>>;
    legend: ReactNode;
};

const motionUnit = (): number => motionUnitMs(getComputedStyle(document.documentElement).getPropertyValue('--motion-base'));

// The sound switch is this browser's: off unless the reader turned it on here (localStorage, read
// through useSyncExternalStore with off as the server's answer).
const SOUND_KEY = 'aero-office:sound';
const readSound = (): boolean => {
    try {
        return window.localStorage.getItem(SOUND_KEY) === 'on';
    } catch {
        return false;
    }
};
const subscribeSound = (onChange: () => void) => {
    window.addEventListener('storage', onChange);
    window.addEventListener(SOUND_KEY, onChange);
    return () => {
        window.removeEventListener('storage', onChange);
        window.removeEventListener(SOUND_KEY, onChange);
    };
};
const writeSound = (on: boolean) => {
    try {
        window.localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
    } catch {
        // Storage refused (a private window): the switch still flips for this page.
    }
    window.dispatchEvent(new Event(SOUND_KEY));
};

const OfficeApp = (props: Props) => {
    const {initial, owner, enabled, ratingTitle, extras, career, budgets, terms} = props;
    const router = useRouter();
    const rootRef = useRef<HTMLDivElement>(null);
    const controls = useRef<OfficeStageControls | null>(null);
    const {state: live, dispatch, pollNow} = useLiveFeed(initial);
    const mode = liveMode(live);
    const now = useClock(initial.serverNow, mode === 'replay' ? 100 : 1000);
    const serverNow = now + live.offset;
    const progress = live.replay ? replayProgress(live.replay, now) : 1;
    const [engine, setEngine] = useState<'auto' | '2d'>(props.engine);
    const [picked, setPicked] = useState<WorkerId | null>(null);
    const [follow, setFollow] = useState(true);
    const [preset, setPreset] = useState<OfficePresetId | null>('overview');
    const [showKeys, setShowKeys] = useState(false);
    const [celebrate, setCelebrate] = useState<number | null>(null);

    // A replay that reached its end hands the office back.
    useEffect(() => {
        if (live.replay && progress >= 1) dispatch({type: 'replay-stop'});
    }, [live.replay, progress, dispatch]);

    // When the office opens on a finished session, it plays it back once (none with motion reduced).
    const played = useRef<string | null>(null);
    useEffect(() => {
        const id = live.view.session?.sessionId ?? null;
        if (id === null || played.current === id) return;
        played.current = id;
        if (mode === 'idle' && sessionSpan(live.view) !== null) {
            const duration = officeReplayDuration(motionUnit());
            if (duration > 0) dispatch({type: 'replay-start', at: Date.now(), duration});
        }
    }, [live.view, mode, dispatch]);

    // What the browser has seen, and when: a live event's window opens when the view that carried it
    // arrived (its own server time), so a window is never over before it is drawn. Kept with the
    // view it was read from and brought up to date while rendering, as React's derived-state pattern.
    const [seen, setSeen] = useState<{view: LiveView; session: string | null; map: ReadonlyMap<string, number>}>(() => ({
        view: initial,
        session: initial.session?.sessionId ?? null,
        map: seenAfter(new Map(), initial, initial.serverNow, true),
    }));
    if (seen.view !== live.view) {
        const session = live.view.session?.sessionId ?? null;
        const fresh = seen.session !== session;
        setSeen({view: live.view, session, map: seenAfter(fresh ? new Map() : seen.map, live.view, live.view.serverNow, false)});
    }

    // The server's parts of the page (the career, the totals, the budgets) after a session moves.
    const statusKey = `${live.view.session?.sessionId ?? ''}:${live.view.session?.status ?? ''}`;
    const settled = useRef(statusKey);
    useEffect(() => {
        if (statusKey !== settled.current) {
            settled.current = statusKey;
            router.refresh();
        }
    }, [statusKey, router]);

    const shown = live.replay ? replayFrame(live.view, progress) : live.view;
    // Never earlier than the view itself: the clock ticks once a second, and a poll that lands between
    // two ticks would otherwise hold back what it carried until the next one.
    const at = live.replay ? (replayCut(live.view, progress) ?? serverNow) : Math.max(serverNow, live.view.serverNow);
    const scale = live.replay ? replayWindowScale(live.view, live.replay.duration) : 1;
    const symbol = live.pinned || !live.replay ? live.symbol : shown.session?.current?.symbol ?? live.symbol;
    const office = useMemo(
        () => officeState({view: shown, now: at, mode, symbol, seen: mode === 'live' ? seen.map : undefined, windowScale: scale, extras}),
        [shown, at, mode, symbol, seen, scale, extras],
    );

    // The owner's Approve, live: a burst of confetti over the execution desk.
    const lampRef = useRef(office.lamp);
    useEffect(() => {
        const before = lampRef.current;
        lampRef.current = office.lamp;
        if (mode === 'live' && before === 'awaiting' && office.lamp === 'approved') {
            setCelebrate(Date.now());
            const id = setTimeout(() => setCelebrate(null), 2600);
            return () => clearTimeout(id);
        }
        return undefined;
    }, [office.lamp, mode]);

    // Sound: made at the reader's own gesture (the switch, M), or at their first one when the page
    // opened with it on; then each new event on the ticker, live or played back, sounds its cue.
    const storedSound = useSyncExternalStore(subscribeSound, readSound, () => false);
    const [pageSound, setPageSound] = useState<boolean | null>(null);
    const sound = pageSound ?? storedSound;
    const player = useRef<OfficeSoundPlayer | null>(null);
    const wakeSound = useCallback(() => {
        player.current ??= createOfficeSound();
        player.current?.unlock();
    }, []);
    const toggleSound = useCallback(() => {
        const next = !sound;
        if (next) wakeSound();
        setPageSound(next);
        writeSound(next);
    }, [sound, wakeSound]);
    useEffect(() => () => player.current?.dispose(), []);
    useEffect(() => {
        if (!sound) return;
        window.addEventListener('pointerdown', wakeSound, {once: true});
        window.addEventListener('keydown', wakeSound, {once: true});
        return () => {
            window.removeEventListener('pointerdown', wakeSound);
            window.removeEventListener('keydown', wakeSound);
        };
    }, [sound, wakeSound]);
    const heard = useRef<{key: string; ids: Set<string>} | null>(null);
    useEffect(() => {
        const ids = office.ticker.map((line) => line.id);
        const key = `${office.sessionId ?? ''}:${mode}`;
        const held = heard.current;
        if (!held || held.key !== key) {
            heard.current = {key, ids: new Set(ids)};
            return;
        }
        const fresh = ids.filter((id) => !held.ids.has(id)).reverse();
        for (const id of ids) held.ids.add(id);
        if (!sound || mode === 'idle' || fresh.length === 0) return;
        for (const {cue, delay} of cuesFor(fresh)) player.current?.play(cue, delay);
    }, [office.ticker, office.sessionId, mode, sound]);

    // The New York clock: the sky, the wall clock and the market lamp follow it, not the session.
    const minute = Math.floor(serverNow / 60_000);
    const daylight = useMemo(() => {
        const when = new Date(minute * 60_000);
        return {etMinutes: Math.floor(easternParts(when).minutes), marketOpen: marketStatus(when).state === 'open'};
    }, [minute]);
    const marketLine = useMemo(() => describeMarketStatus(marketStatus(new Date(minute * 60_000))), [minute]);
    const clock = officeClock(serverNow);

    // A session just asked for takes a moment to open: a few quick polls catch it, as on the floor,
    // after which the feed's own pace takes over.
    const kicks = useRef<ReturnType<typeof setTimeout>[]>([]);
    useEffect(() => () => kicks.current.forEach(clearTimeout), []);
    const kick = useCallback(() => {
        pollNow();
        kicks.current.push(...[1500, 4000, 8000, 15_000].map((ms) => setTimeout(pollNow, ms)));
    }, [pollNow]);

    const startReplay = useCallback(() => {
        dispatch({type: 'replay-start', at: Date.now(), duration: officeReplayDuration(motionUnit())});
    }, [dispatch]);
    const canReplay = !isSessionLive(live.view) && sessionSpan(live.view) !== null;

    // A seat's file opens from a plate, the roster or a click on the floor; closing it hands the
    // focus back to the button that opened it.
    const returnFocus = useRef<HTMLElement | null>(null);
    const open = useCallback((id: WorkerId) => {
        returnFocus.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
        setPicked(id);
        setFollow(false);
        controls.current?.setPreset(presetForSeat(id));
    }, [setPicked, setFollow]);
    const close = useCallback(() => {
        setPicked(null);
        const back = returnFocus.current;
        returnFocus.current = null;
        if (back?.isConnected) requestAnimationFrame(() => back.focus());
    }, [setPicked]);

    const onIntent = useCallback((intent: OfficeIntent) => {
        switch (intent.type) {
            case 'preset':
                setFollow(false);
                controls.current?.setPreset(intent.preset);
                break;
            case 'follow':
                setFollow((on) => !on);
                break;
            case 'zoom':
                controls.current?.zoom(intent.factor);
                break;
            case 'step': {
                const current = (document.activeElement as HTMLElement | null)?.dataset?.officeWorker as WorkerId | undefined;
                const index = current ? WORKER_IDS.indexOf(current) : -1;
                const next = WORKER_IDS[(index + intent.by + WORKER_IDS.length) % WORKER_IDS.length];
                rootRef.current?.querySelector<HTMLElement>(`[data-office-roster] [data-office-worker="${next}"]`)?.focus();
                break;
            }
            case 'replay':
                if (live.replay) dispatch({type: 'replay-stop'});
                else if (canReplay) startReplay();
                break;
            case 'plan':
                setEngine((e) => (e === '2d' ? 'auto' : '2d'));
                break;
            case 'clear':
                close();
                break;
            case 'sound':
                toggleSound();
                break;
            default:
                break;
        }
    }, [live.replay, canReplay, startReplay, dispatch, setFollow, setEngine, close, toggleSound]);
    useOfficeKeys(rootRef, onIntent);

    const session = live.view.session;
    const connection = live.replay ? OFFICE_COPY.replaying(Math.round(progress * 100))
        : mode === 'live' ? (live.failures > 1 ? OFFICE_COPY.reconnecting : OFFICE_COPY.live(POLL_LIVE_MS / 1000))
        : OFFICE_COPY.idle;

    return (
        <div ref={rootRef} data-office-app data-office-mode={mode} data-office-status={session?.status ?? ''} data-office-session={session?.sessionId ?? ''} data-office-seq={live.view.seq}
            className="flex min-h-dvh flex-col lg:h-dvh lg:overflow-hidden">
            {/* Two rows: where you are and what the session is doing, then the session's own actions on
                the left (clear of the toasts, which open over the middle) and the camera on the right. */}
            <header className="chrome-surface relative z-20 px-4 py-2">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <a href="/agent-world" data-office-back className="flex items-center gap-1 text-sm text-fg-soft hover:text-fg focus-visible:outline-2 focus-visible:outline-brand">
                        <span className="material-symbols-outlined text-base" aria-hidden="true">arrow_back</span>
                        {OFFICE_COPY.back}
                    </a>
                    <div className="min-w-0 flex-1">
                        <h1 className="font-heading text-base font-semibold leading-tight text-fg">{OFFICE_COPY.title}</h1>
                        <p className="hidden truncate text-[11px] text-fg-muted xl:block">{OFFICE_COPY.subtitle}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <div className="flex items-center gap-2" data-office-connection aria-live="polite">
                            <span aria-hidden="true" className={cn('size-2 rounded-full', mode === 'live' ? (live.failures > 1 ? 'bg-warning' : 'bg-brand ao-lamp') : mode === 'replay' ? 'bg-brand' : 'bg-line-strong')} />
                            <span className="text-xs text-fg-soft">{connection}</span>
                            {session && <Badge tone="neutral" variant="outline">{KIND_COPY[session.kind]}</Badge>}
                            {session && <Badge tone={session.status === 'failed' ? 'warning' : 'brand'}>{STATUS_COPY[session.status]}</Badge>}
                            {session?.kind === 'preview' && <Badge tone="neutral">{FLOOR_COPY.previewBadge}</Badge>}
                        </div>
                        <p className="hidden font-mono text-xs tabular-nums text-fg-muted sm:block" data-office-clock>{OFFICE_COPY.clock(clock)} · {marketLine}</p>
                    </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                    {live.replay ? (
                        <ActionButton variant="secondary" size="sm" data-office-replay-stop onClick={() => dispatch({type: 'replay-stop'})}>{OFFICE_COPY.stop}</ActionButton>
                    ) : canReplay && (
                        <ActionButton variant="secondary" size="sm" data-office-replay title={OFFICE_COPY.replayNote(OFFICE_REPLAY_MS / 1000)} aria-keyshortcuts={OFFICE_KEY_SHORTCUTS.replay} onClick={startReplay}>{OFFICE_COPY.replay}</ActionButton>
                    )}
                    {owner && enabled && !live.replay && <RunNowButton live={isSessionLive(live.view)} onStarted={kick} />}
                    <div className="ml-auto flex flex-wrap items-center gap-2">
                        <label className="flex items-center gap-1.5 text-xs text-fg-soft">
                            <Switch checked={follow} onCheckedChange={setFollow} aria-keyshortcuts={OFFICE_KEY_SHORTCUTS.follow} data-office-follow-switch />
                            {OFFICE_COPY.follow}
                        </label>
                        <select aria-label={OFFICE_COPY.camera} data-office-presets value={preset ?? ''} onChange={(event) => {
                            const value = event.target.value as OfficePresetId;
                            setFollow(false);
                            controls.current?.setPreset(value);
                        }} className="rounded-md border border-line bg-surface-1 px-2 py-1 text-xs text-fg">
                            {preset === null && <option value="">{OFFICE_COPY.camera}</option>}
                            {OFFICE_PRESET_IDS.map((id, i) => <option key={id} value={id}>{i} · {OFFICE_PRESET_COPY[id]}</option>)}
                        </select>
                        <button type="button" className={iconButton} aria-label={OFFICE_COPY.zoomOut} aria-keyshortcuts={OFFICE_KEY_SHORTCUTS.zoomOut} onClick={() => controls.current?.zoom(1.25)}>
                            <span className="material-symbols-outlined text-lg" aria-hidden="true">remove</span>
                        </button>
                        <button type="button" className={iconButton} aria-label={OFFICE_COPY.zoomIn} aria-keyshortcuts={OFFICE_KEY_SHORTCUTS.zoomIn} onClick={() => controls.current?.zoom(0.8)}>
                            <span className="material-symbols-outlined text-lg" aria-hidden="true">add</span>
                        </button>
                        <button type="button" className={iconButton} data-office-sound={sound ? 'on' : 'off'} aria-pressed={sound} aria-label={OFFICE_COPY.sound} title={OFFICE_COPY.soundOn}
                            aria-keyshortcuts={OFFICE_KEY_SHORTCUTS.sound} onClick={toggleSound}>
                            <span className="material-symbols-outlined text-lg" aria-hidden="true">{sound ? 'volume_up' : 'volume_off'}</span>
                        </button>
                        <ActionButton variant="secondary" size="sm" data-office-plan aria-keyshortcuts={OFFICE_KEY_SHORTCUTS.plan} onClick={() => setEngine((e) => (e === '2d' ? 'auto' : '2d'))}>
                            {engine === '2d' ? OFFICE_COPY.view3d : OFFICE_COPY.plan}
                        </ActionButton>
                        <div className="relative">
                            <button type="button" className={iconButton} aria-label={OFFICE_COPY.keys} aria-expanded={showKeys} onClick={() => setShowKeys((v) => !v)}>
                                <span className="material-symbols-outlined text-lg" aria-hidden="true">keyboard</span>
                            </button>
                            {showKeys && (
                                <div className="chrome-surface absolute right-0 top-full z-30 mt-2 w-72 rounded-lg p-3" data-office-keys>
                                    <dl className="space-y-1 text-xs">
                                        {OFFICE_KEYS_COPY.map((row) => (
                                            <div key={row.keys} className="flex gap-3">
                                                <dt className="w-14 shrink-0 font-mono text-fg">{row.keys}</dt>
                                                <dd className="text-fg-soft">{row.what}</dd>
                                            </div>
                                        ))}
                                    </dl>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                {props.offNote && <p className="mt-1 w-full text-xs text-fg-muted" data-office-off>{props.offNote}</p>}
            </header>

            <main className="flex flex-1 flex-col lg:min-h-0 lg:flex-row">
                <section className="relative h-[64dvh] min-h-[22rem] lg:h-auto lg:min-h-0 lg:flex-1" aria-label={OFFICE_COPY.stageLabel}>
                    <OfficeStage
                        state={office}
                        now={at}
                        rate={scale}
                        daylight={daylight}
                        engine={engine}
                        selected={picked}
                        onSelect={(id) => (id ? open(id) : close())}
                        follow={follow}
                        onFollowChange={setFollow}
                        onCamera={(info) => setPreset(info.preset)}
                        controlsRef={controls}
                        ratingTitle={ratingTitle}
                        marketLine={marketLine}
                        clock={OFFICE_COPY.clock(clock)}
                        sessionsToDate={extras.sessionsToDate}
                        costToDateCents={extras.costToDateCents}
                        celebrate={celebrate}
                    />
                    {!session && (
                        <div className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center px-4" data-office-empty>
                            <div className="chrome-surface pointer-events-auto max-w-md rounded-xl p-4 text-center">
                                <p className="font-heading text-sm font-semibold text-fg">{OFFICE_COPY.noSessionTitle}</p>
                                <p className="mt-1 text-xs text-fg-soft">{OFFICE_COPY.noSessionBody}</p>
                                {props.nextSessionNote && <p className="mt-1 text-xs text-fg-muted">{props.nextSessionNote}</p>}
                                {owner && enabled && <div className="mt-3 flex justify-center"><RunNowButton live={false} onStarted={kick} /></div>}
                            </div>
                        </div>
                    )}
                </section>
                <aside className="space-y-3 border-line p-3 lg:w-[24rem] lg:shrink-0 lg:overflow-y-auto lg:border-l">
                    <p className="text-[11px] leading-snug text-fg-muted" data-office-caveat>{AGENT_WORLD_COPY.caveat}</p>
                    <OfficeWall office={office} pinned={live.pinned} onPick={(s) => dispatch({type: 'pick', symbol: s})} onFollow={() => dispatch({type: 'follow'})}
                        ratingTitle={ratingTitle} nextSessionNote={props.nextSessionNote} terms={terms.board} />
                    <OfficeRoster office={office} selected={picked} onOpen={open} />
                    <OfficeTicker office={office} />
                    {props.legend}
                </aside>
            </main>

            <OfficeDossier id={picked} office={office} view={shown} career={career} budgets={budgets} owner={owner} enabled={enabled} ratingTitle={ratingTitle} terms={terms}
                onClose={close} onDecided={pollNow} />
        </div>
    );
};

export default OfficeApp;
