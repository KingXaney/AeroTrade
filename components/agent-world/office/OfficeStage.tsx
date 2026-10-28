'use client';

import {useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject} from "react";
import RatingBadge from "@/components/agent-world/RatingBadge";
import OfficeMap2D from "@/components/agent-world/office/OfficeMap2D";
import {seatDot, seatEdge, ACTIVE_STATUSES} from "@/components/agent-world/office/office-look";
import {OFFICE_TOKENS, type OfficePalette} from "@/components/agent-world/office/office-tokens";
import type {OfficeCameraInfo, OfficeDaylight, OfficeScene} from "@/components/agent-world/office/office-scene";
import {readTokens, useCoarsePointer, useReducedMotion, useThemeStamp, useWebGL} from "@/components/three/scene-env";
import {WORKER_IDS, type WorkerId} from "@/lib/agent-world/config";
import type {OfficeState} from "@/lib/agent-world/office";
import {OFFICE_ZONES, type OfficePresetId} from "@/lib/agent-world/office-layout";
import {formatCents} from "@/lib/agent-world/page-view";
import {formatPrice} from "@/lib/format";
import {FLOOR_COPY} from "@/lib/learn/copy/agent-world";
import {OFFICE_COPY, WORKER_STATUS_COPY, ZONE_COPY, workerName} from "@/lib/learn/copy/agent-world-office";
import {cn} from "@/lib/utils";

// The office's stage: the three.js floor (components/agent-world/office/office-scene.ts, loaded on
// demand) with every word on it as HTML the scene places — a nameplate over each seat (a button:
// Tab walks them in the order a run reaches them, Enter opens the seat's file), the bubble of a
// seat that just spoke or filed, the shelves' providers and their refusal tags, the rating cards,
// the wall's totals, the issue, the stamp. Without WebGL, or with ?engine=2d, the floor plan
// (OfficeMap2D) draws the same seats and statuses. The canvas is aria-hidden; the host is a group.

export type OfficeStageControls = {setPreset: (preset: OfficePresetId) => void; zoom: (factor: number) => void};

type Props = {
    state: OfficeState;
    now: number;
    rate: number;
    daylight: OfficeDaylight;
    engine: 'auto' | '2d';
    selected: WorkerId | null;
    onSelect: (id: WorkerId | null) => void;
    follow: boolean;
    onFollowChange: (on: boolean) => void;
    onCamera: (info: OfficeCameraInfo) => void;
    controlsRef: RefObject<OfficeStageControls | null>;
    ratingTitle: string;
    marketLine: string;
    clock: string;
    sessionsToDate: number;
    costToDateCents: number;
    celebrate: number | null;
};

const readPalette = (): OfficePalette => readTokens(OFFICE_TOKENS);
const NEAR_DISTANCE = 21;

// The wheel zooms at once where the page does not scroll (the wide layout fills the screen).
const WIDE = '(min-width: 1024px)';
const subscribeWide = (onChange: () => void) => {
    const query = window.matchMedia(WIDE);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
};
const useWide = () => useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => false);

// On a phone's width the plates carry a task line only for the seat picked or in focus.
const ROOMY = '(min-width: 640px)';
const subscribeRoomy = (onChange: () => void) => {
    const query = window.matchMedia(ROOMY);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
};
const useRoomy = () => useSyncExternalStore(subscribeRoomy, () => window.matchMedia(ROOMY).matches, () => true);

// Confetti for the owner's Approve: pieces in the seats' colours, each its own drift, from a seed.
const CONFETTI = Array.from({length: 36}, (_, i) => {
    const h = (i * 2654435761) >>> 0;
    return {
        dx: ((h % 200) - 100) * 1.6,
        dy: 90 + ((h >>> 8) % 120),
        rot: ((h >>> 4) % 720) - 360,
        delay: (h >>> 12) % 260,
        colour: ['bg-[color:var(--office-team-analysts)]', 'bg-[color:var(--office-team-research)]', 'bg-[color:var(--office-team-trading)]', 'bg-[color:var(--office-team-risk)]', 'bg-[color:var(--office-desk-head)]', 'bg-brand'][i % 6],
        wide: i % 3 === 0,
    };
});

const OfficeStage = (props: Props) => {
    const {state, now, rate, daylight, engine, selected, onSelect, follow, onFollowChange, onCamera, controlsRef, ratingTitle} = props;
    const webgl = useWebGL();
    const stamp = useThemeStamp();
    const osReduced = useReducedMotion();
    const coarse = useCoarsePointer();
    const wide = useWide();
    const roomy = useRoomy();
    const reduced = osReduced || stamp.endsWith('|reduced');
    const [sceneFailed, setSceneFailed] = useState(false);
    const [ready, setReady] = useState(false);
    const [near, setNear] = useState(false);
    const [preset, setPresetState] = useState<OfficePresetId | null>('overview');

    const hostRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const sceneRef = useRef<OfficeScene | null>(null);
    const overlays = useRef(new Map<string, HTMLElement>());
    const latest = useRef({state, now, rate, daylight, follow, reduced, coarse, wide, onSelect, onFollowChange, onCamera});
    useEffect(() => {
        latest.current = {state, now, rate, daylight, follow, reduced, coarse, wide, onSelect, onFollowChange, onCamera};
    });

    const threeD = engine === 'auto' && webgl === true && !sceneFailed;
    const register = useCallback((id: string) => (element: HTMLElement | null) => {
        if (element) overlays.current.set(id, element);
        else overlays.current.delete(id);
    }, []);

    useEffect(() => {
        sceneRef.current?.setReduceMotion(reduced);
    }, [reduced]);

    // The scene, once there is WebGL and a canvas; a failure falls back to the floor plan.
    useEffect(() => {
        if (!threeD) return;
        const canvas = canvasRef.current;
        const host = hostRef.current;
        if (!canvas || !host) return;
        let cancelled = false;
        let scene: OfficeScene | null = null;
        import('@/components/agent-world/office/office-scene')
            .then(({createOfficeScene}) => {
                if (cancelled) return;
                try {
                    const now = latest.current;
                    scene = createOfficeScene({
                        canvas,
                        palette: readPalette(),
                        reduceMotion: now.reduced,
                        coarsePointer: now.coarse,
                        wheelZoom: now.wide,
                        initial: {state: now.state, now: now.now, rate: now.rate, daylight: now.daylight},
                        follow: now.follow,
                        onHover: () => undefined,
                        onPick: (id) => latest.current.onSelect(id),
                        onFollowChange: (on) => latest.current.onFollowChange(on),
                        onCamera: (info) => {
                            setNear(info.distance < NEAR_DISTANCE);
                            setPresetState(info.preset);
                            latest.current.onCamera(info);
                        },
                        onDrawn: (frames, calls) => {
                            host.dataset.officeDrawn = String(frames);
                            host.dataset.officeCalls = String(calls);
                        },
                        overlays: () => [...overlays.current].map(([id, element]) => ({id, element})),
                    });
                    sceneRef.current = scene;
                    setReady(true);
                } catch (error) {
                    console.error('The office: the scene could not start', error);
                    setSceneFailed(true);
                }
            })
            .catch(() => {
                if (!cancelled) setSceneFailed(true);
            });
        return () => {
            cancelled = true;
            scene?.dispose();
            sceneRef.current = null;
            setReady(false);
        };
    }, [threeD]);

    // The state, every tick; the scene diffs it.
    useEffect(() => {
        sceneRef.current?.setState(state, now, rate);
    }, [state, now, rate, ready]);
    useEffect(() => {
        sceneRef.current?.setDaylight(daylight);
    }, [daylight, ready]);
    useEffect(() => {
        sceneRef.current?.setSelected(selected);
    }, [selected, ready]);
    useEffect(() => {
        sceneRef.current?.setFollow(follow);
    }, [follow, ready]);
    useEffect(() => {
        sceneRef.current?.setPalette(readPalette());
    }, [stamp, ready]);

    // Draw only while the stage is on screen and the tab is visible.
    useEffect(() => {
        if (!threeD) return;
        const host = hostRef.current;
        if (!host) return;
        let inView = true;
        const apply = () => sceneRef.current?.setActive(inView && !document.hidden);
        const observer = new IntersectionObserver(([entry]) => {
            inView = entry?.isIntersecting ?? true;
            apply();
        });
        observer.observe(host);
        document.addEventListener('visibilitychange', apply);
        return () => {
            observer.disconnect();
            document.removeEventListener('visibilitychange', apply);
        };
    }, [threeD]);

    useEffect(() => {
        controlsRef.current = {
            setPreset: (id) => sceneRef.current?.setPreset(id),
            zoom: (factor) => sceneRef.current?.zoom(factor),
        };
        return () => {
            controlsRef.current = null;
        };
    }, [controlsRef]);

    const workers = useMemo(() => new Map(state.workers.map((w) => [w.id, w])), [state.workers]);
    const light = (id: WorkerId | null) => sceneRef.current?.setHover(id);
    const stateAttrs = {
        'data-office-stage': '',
        'data-office-mode': state.mode,
        'data-office-focus': state.focus ?? '',
        'data-office-follow': follow ? 'true' : 'false',
        'data-office-selected': selected ?? '',
        'data-office-lamp': state.lamp,
        'data-office-issue': state.issue.state,
        'data-office-motion': reduced ? 'reduced' : 'auto',
    };

    if (engine === '2d' || webgl === false || sceneFailed) {
        return (
            <div {...stateAttrs} data-office-engine="2d" data-office-state="flat" className="relative h-full w-full overflow-auto">
                <OfficeMap2D state={state} selected={selected} onSelect={onSelect} ratingTitle={ratingTitle} note={OFFICE_COPY.engine2d} />
            </div>
        );
    }

    const plate = (id: WorkerId): ReactNode => {
        const worker = workers.get(id);
        if (!worker) return null;
        const status = WORKER_STATUS_COPY[worker.status];
        const name = workerName(id);
        const showTask = (near && roomy) || id === selected || id === state.focus;
        const showStatus = (near && roomy) || id === selected || ACTIVE_STATUSES.has(worker.status) || worker.status === 'filed' || worker.status === 'stopped';
        // The scene places the wrapper and, when the plate climbs a row to clear a neighbour, sets
        // --ao-lift: the stem below reaches back down to the seat.
        return (
            <span key={`plate:${id}`} ref={register(`plate:${id}`)} style={{visibility: 'hidden'}} className="absolute left-0 top-0 -translate-x-1/2 -translate-y-full transition-[opacity]">
                <button
                    type="button"
                    data-office-plate={id}
                    data-status={worker.status}
                    aria-pressed={id === selected}
                    aria-label={OFFICE_COPY.picked(name, status, worker.task)}
                    onClick={() => onSelect(id)}
                    onMouseEnter={() => light(id)}
                    onMouseLeave={() => light(null)}
                    onFocus={() => light(id)}
                    onBlur={() => light(null)}
                    className={cn(
                        'chrome-surface pointer-events-auto relative block overflow-hidden whitespace-nowrap rounded-lg py-1 pl-2.5 pr-2 text-left focus-visible:outline-2 focus-visible:outline-brand',
                        id === selected && 'outline outline-2 outline-brand',
                    )}
                >
                    <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-[3px]', seatEdge(id))} />
                    <span className="flex items-center gap-1.5 text-[11px] leading-tight">
                        <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', seatDot(worker.status), ACTIVE_STATUSES.has(worker.status) && 'ao-lamp')} />
                        <span className="font-medium text-fg">{name}</span>
                        {showStatus && <span className="text-fg-muted">· {status}</span>}
                    </span>
                    {showTask && <span className="mt-0.5 block max-w-52 truncate text-[10px] leading-tight text-fg-soft">{worker.task}</span>}
                </button>
                <span aria-hidden="true" className={cn('absolute top-full w-0.5 -translate-x-1/2 rounded-b', seatEdge(id))} style={{height: 'var(--ao-lift, 0px)', left: 'calc(50% + var(--ao-stem-x, 0px))'}} />
            </span>
        );
    };

    return (
        <div ref={hostRef} {...stateAttrs} data-office-engine="3d" data-office-state={ready ? 'ready' : 'loading'} data-office-zoom={near ? 'near' : 'far'} data-office-preset={preset ?? ''}
            role="group" aria-label={OFFICE_COPY.stageLabel} className="relative h-full w-full overflow-hidden" style={{touchAction: 'pan-y'}}>
            <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 block h-full w-full" />
            {!ready && <div className="absolute inset-0 animate-pulse bg-surface-2/40" aria-hidden="true" />}
            <div className="pointer-events-none absolute inset-0">
                {!near && OFFICE_ZONES.map((zone) => (
                    <span key={zone.id} ref={register(`zone:${zone.id}`)} data-office-zone={zone.id} style={{visibility: 'hidden'}}
                        className="label-type absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-surface-1/70 px-1.5 py-0.5 text-[10px] text-fg-soft">
                        {ZONE_COPY[zone.id]}
                    </span>
                ))}
                {state.shelves.map((shelf) => (
                    <span key={shelf.vendor} ref={register(`shelf:${shelf.vendor}`)} data-office-shelf={shelf.vendor} data-hot={shelf.hot ? 'true' : 'false'} data-refused={shelf.refused ? 'true' : 'false'}
                        style={{visibility: 'hidden'}} className="absolute left-0 top-0 flex -translate-x-1/2 -translate-y-full items-center gap-1 whitespace-nowrap">
                        <span className={cn('chrome-surface rounded px-1 py-px font-mono text-[9px] text-fg', shelf.hot && 'outline outline-1 outline-brand')}>{shelf.label}{shelf.fetches > 0 ? ` · ${shelf.fetches}` : ''}</span>
                        {shelf.tag && <span key={shelf.tag.at} className="ao-stamp-in rounded bg-warning px-1 font-mono text-[10px] font-semibold text-bg">{shelf.tag.note ?? ZONE_COPY.noAnswer}</span>}
                    </span>
                ))}
                {state.ratings.some((rating) => rating.rating !== null) && (
                    <span ref={register('cork')} data-office-cork style={{visibility: 'hidden'}}
                        className="chrome-surface absolute left-0 top-0 grid -translate-x-1/2 -translate-y-full grid-cols-[repeat(2,auto)] gap-x-2 gap-y-1 rounded-md px-1.5 py-1">
                        {state.ratings.map((rating) => rating.rating === null ? null : (
                            <span key={rating.symbol} data-office-card={rating.symbol} data-rating={rating.rating} className="flex items-center gap-1 whitespace-nowrap">
                                <span className="font-mono text-[10px] font-semibold text-fg">{rating.symbol}</span>
                                <RatingBadge rating={rating.rating} title={ratingTitle} />
                            </span>
                        ))}
                    </span>
                )}
                <span ref={register('wall')} data-office-wall style={{visibility: 'hidden'}}
                    className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-center font-mono text-[10px] leading-tight text-on-brand">
                    <span className="block text-[11px] font-semibold text-[color:var(--office-screen-glow)]">{props.clock}</span>
                    <span className="block text-[color:var(--office-screen-glow)] opacity-80">{ZONE_COPY.wallSessions} {props.sessionsToDate} · {formatCents(props.costToDateCents)}</span>
                </span>
                {state.issue.state !== 'none' && (
                    <span ref={register('issue')} data-office-issue-chip={state.issue.state} style={{visibility: 'hidden'}}
                        className="pointer-events-auto absolute left-0 top-0 flex -translate-x-1/2 -translate-y-full items-center gap-1 whitespace-nowrap">
                        <span className="chrome-surface rounded-md px-1.5 py-0.5 text-[10px] text-fg">
                            {state.issue.url ? <a href={state.issue.url} target="_blank" rel="noopener noreferrer" className="font-mono underline decoration-dotted">{state.issue.identifier ?? ZONE_COPY.issue}</a> : <span className="font-mono">{state.issue.identifier ?? ZONE_COPY.issue}</span>}
                            <span className="text-fg-muted"> · {state.issue.state === 'open' ? ZONE_COPY.issueOpen : state.issue.state === 'handed-in' || state.issue.state === 'blocked' ? ZONE_COPY.issueReview : ZONE_COPY.issueDone}</span>
                        </span>
                    </span>
                )}
                {(state.lamp === 'approved' || state.lamp === 'declined') && (
                    <span ref={register('stamp')} data-office-stamp={state.lamp} style={{visibility: 'hidden'}} className="absolute left-0 top-0 -translate-x-1/2 -translate-y-full">
                        <span className={cn('ao-stamp-in inline-block rounded-md border-2 px-2 py-0.5 font-heading text-xs font-bold uppercase tracking-wide', state.lamp === 'approved' ? 'border-brand text-brand' : 'border-warning text-warning')}>
                            {state.lamp === 'approved' ? ZONE_COPY.stampApproved : ZONE_COPY.stampDeclined}
                        </span>
                    </span>
                )}
                {props.celebrate !== null && (
                    <span key={props.celebrate} ref={register('confetti')} data-office-confetti style={{visibility: 'hidden'}} aria-hidden="true" className="absolute left-0 top-0">
                        {CONFETTI.map((piece, i) => (
                            <span key={i} className={cn('ao-confetti absolute left-0 top-0 block rounded-[1px]', piece.colour, piece.wide ? 'h-1.5 w-2.5' : 'h-2.5 w-1.5')}
                                style={{['--ao-dx' as string]: `${piece.dx}px`, ['--ao-dy' as string]: `${piece.dy}px`, ['--ao-rot' as string]: `${piece.rot}deg`, ['--ao-delay' as string]: `${piece.delay}ms`}} />
                        ))}
                    </span>
                )}
                {/* The approval post: while the session waits, its chip opens the Execution desk's file,
                    where an owner decides. Approved and declined are the stamp's to say. */}
                {(state.lamp === 'awaiting' || state.lamp === 'lapsed' || state.lamp === 'preview') && (
                    <span ref={register('lamp')} style={{visibility: 'hidden'}} className="absolute left-0 top-0 -translate-x-1/2 -translate-y-full whitespace-nowrap">
                        <button type="button" data-office-lamp-chip={state.lamp} onClick={() => onSelect('execution-desk')}
                            className={cn('chrome-surface pointer-events-auto flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium text-fg focus-visible:outline-2 focus-visible:outline-brand',
                                state.lamp === 'awaiting' && 'outline outline-2 outline-brand')}>
                            <span aria-hidden="true" className={cn('size-2 rounded-full', state.lamp === 'awaiting' ? 'ao-lamp bg-brand' : 'bg-line-strong')} />
                            {state.lamp === 'awaiting' ? ZONE_COPY.lampAwaiting : state.lamp === 'lapsed' ? ZONE_COPY.lampLapsed : ZONE_COPY.lampPreview}
                        </button>
                    </span>
                )}
                <span ref={register('chute')} data-office-chute style={{visibility: 'hidden'}} className="absolute left-0 top-0 -translate-x-full -translate-y-full whitespace-nowrap">
                    <span className="chrome-surface flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-fg" title={props.marketLine}>
                        {ZONE_COPY.chute} · <span className="text-fg-muted">{daylight.marketOpen ? ZONE_COPY.marketOpen : ZONE_COPY.marketClosed}</span>
                        {state.tickets.filter((t) => t.executed).map((ticket) => (
                            <span key={ticket.symbol} data-office-ticket={ticket.symbol} data-ok="true" title={FLOOR_COPY.fillLine(ticket.symbol, ticket.side === 'sell', ticket.quantity, formatPrice(ticket.price ?? 0))}
                                className="ml-1 rounded bg-brand/15 px-1 font-mono text-fg">{ticket.symbol}</span>
                        ))}
                    </span>
                </span>
                {state.tickets.some((t) => !t.executed) && (
                    <span ref={register('returned')} data-office-returned style={{visibility: 'hidden'}} className="absolute left-0 top-0 -translate-x-1/2 -translate-y-full whitespace-nowrap">
                        <span className="chrome-surface flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-fg">
                            {ZONE_COPY.returned} · {state.tickets.filter((t) => !t.executed).length}
                            {state.tickets.filter((t) => !t.executed).map((ticket) => (
                                <span key={ticket.symbol} data-office-ticket={ticket.symbol} data-ok="false" title={FLOOR_COPY.fillFailed(ticket.symbol, ticket.message ?? '')}
                                    className="ml-1 rounded bg-warning/20 px-1 font-mono text-fg">{ticket.symbol}</span>
                            ))}
                        </span>
                    </span>
                )}
                {state.scoreboard.refusals > 0 && (
                    <span ref={register('bin')} data-office-bin style={{visibility: 'hidden'}} className="absolute left-0 top-0 -translate-x-1/2 -translate-y-full whitespace-nowrap">
                        <span className="chrome-surface rounded-md px-1.5 py-0.5 text-[10px] text-fg">{ZONE_COPY.bin} · {state.scoreboard.refusals}</span>
                    </span>
                )}
                {state.workers.filter((w) => w.bubble !== null).map((worker) => (
                    <div key={`bubble:${worker.id}`} ref={register(`bubble:${worker.id}`)} data-office-bubble={worker.id} style={{visibility: 'hidden'}}
                        className="absolute left-0 top-0 -translate-x-1/2 -translate-y-full">
                        <div key={worker.bubbleKey ?? ''} className="ao-bubble-in chrome-surface relative w-max max-w-64 rounded-xl px-3 py-2 text-xs leading-snug text-fg">
                            <span className="label-type block text-[10px] text-fg-muted">{workerName(worker.id)} · {OFFICE_COPY.modelText}</span>
                            <span className="block">“{worker.bubble}”</span>
                            <span aria-hidden="true" className="chrome-tail absolute -bottom-1.5 size-3 -translate-x-1/2 rotate-45" style={{left: 'calc(50% + var(--ao-tail, 0px))'}} />
                        </div>
                    </div>
                ))}
                {WORKER_IDS.map(plate)}
            </div>
        </div>
    );
};

export default OfficeStage;
