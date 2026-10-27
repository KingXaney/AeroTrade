'use client';

import {useEffect, useRef, type ReactNode} from "react";
import {useRouter} from "next/navigation";
import DecisionPanel from "@/components/agent-world/DecisionPanel";
import ReportRail from "@/components/agent-world/ReportRail";
import RunNowButton from "@/components/agent-world/RunNowButton";
import StageStrip from "@/components/agent-world/StageStrip";
import {useClock, useLiveFeed} from "@/components/agent-world/useLiveFeed";
import ActionButton from "@/components/primitives/ActionButton";
import Badge from "@/components/primitives/Badge";
import EmptyState from "@/components/primitives/EmptyState";
import MicroLabel from "@/components/primitives/MicroLabel";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";
import {POLL_LIVE_MS, REPLAY_MS} from "@/lib/agent-world/config";
import {activeRun, isSessionLive, liveMode} from "@/lib/agent-world/live";
import {laneStatus, stageViews} from "@/lib/agent-world/page-view";
import {motionUnitMs, replayDuration, replayFrame, replayProgress, sessionSpan} from "@/lib/agent-world/replay";
import type {LiveView} from "@/lib/agent-world/types";
import {AGENT_WORLD_COPY, FLOOR_COPY, KIND_COPY, REPLAY_COPY, RUN_STATUS_COPY, STATUS_COPY} from "@/lib/learn/copy/agent-world";

// The floor: the newest session as it runs, polled from /api/agent-world/live, or played back from
// what was stored. Three framed surfaces, siblings: the desk (the stage strip and the symbol
// lanes), the texts (one pane that follows the newest), and the decision (ratings, orders, the
// owner's buttons, fills, cost). The glossary disclosures arrive from the server as slots, so the
// glossary itself never ships to the browser.
const LiveFloor = ({initial, owner, enabled, ratingTitle, nextSessionNote, terms}: {
    initial: LiveView;
    owner: boolean;
    enabled: boolean;
    ratingTitle: string;
    nextSessionNote: string | null;
    terms: {strip: ReactNode; reports: ReactNode; decision: ReactNode};
}) => {
    const router = useRouter();
    const {state, dispatch, pollNow} = useLiveFeed(initial);
    // A session just asked for takes a moment to open: a few quick polls catch it, after which the
    // floor's own pace takes over.
    const kicks = useRef<ReturnType<typeof setTimeout>[]>([]);
    useEffect(() => () => kicks.current.forEach(clearTimeout), []);
    const kick = () => {
        pollNow();
        kicks.current.push(...[1500, 4000, 8000, 15_000].map((ms) => setTimeout(pollNow, ms)));
    };
    const mode = liveMode(state);
    const now = useClock(initial.serverNow, mode === 'replay' ? 100 : mode === 'live' ? 1000 : null);
    const serverNow = now + state.offset;
    const progress = state.replay ? replayProgress(state.replay, now) : 1;
    const shown = state.replay ? replayFrame(state.view, progress) : state.view;
    const session = shown.session;
    const run = activeRun(shown, state.pinned || !state.replay ? state.symbol : session?.current?.symbol ?? state.symbol);
    const live = isSessionLive(state.view);

    // A replay that reached its end hands the floor back.
    useEffect(() => {
        if (state.replay && progress >= 1) dispatch({type: 'replay-stop'});
    }, [state.replay, progress, dispatch]);

    // A new session, or one whose status moved (running, awaiting the owner, settled), refreshes the
    // server's parts of the page — the record against SPY with its cost, and the sessions list — a
    // handful of times a session.
    const settled = useRef<string>(`${initial.session?.sessionId ?? ''}:${initial.session?.status ?? ''}`);
    const statusKey = `${state.view.session?.sessionId ?? ''}:${state.view.session?.status ?? ''}`;
    useEffect(() => {
        if (statusKey !== settled.current) {
            settled.current = statusKey;
            router.refresh();
        }
    }, [statusKey, router]);

    if (!session) {
        // No session yet: the floor still polls (slowly), so the first one shows as it starts.
        return (
            <Panel id="agent-world-floor" data-aw-floor data-aw-mode="idle" data-aw-empty>
                <EmptyState
                    size="inline"
                    icon="smart_toy"
                    title={AGENT_WORLD_COPY.emptyTitle}
                    description={AGENT_WORLD_COPY.emptyBody}
                    action={owner && enabled ? <RunNowButton live={false} onStarted={kick} /> : undefined}
                    note={nextSessionNote ?? undefined}
                />
                <div className="mt-4">{terms.strip}</div>
            </Panel>
        );
    }
    const canReplay = !live && sessionSpan(state.view) !== null;
    const startReplay = () => {
        const motion = typeof document === 'undefined' ? 0 : motionUnitMs(getComputedStyle(document.documentElement).getPropertyValue('--motion-base'));
        dispatch({type: 'replay-start', at: Date.now(), duration: replayDuration(motion)});
    };
    const connection = mode === 'replay' ? REPLAY_COPY.running(Math.round(progress * 100))
        : mode === 'live' ? (state.failures > 1 ? FLOOR_COPY.reconnecting : FLOOR_COPY.live(POLL_LIVE_MS / 1000))
            : FLOOR_COPY.idle;

    return (
        <div
            className="space-y-4"
            data-aw-floor
            data-aw-mode={mode}
            data-aw-seq={state.view.seq}
            data-aw-version={state.view.version}
            data-aw-session={session.sessionId}
            data-aw-status={session.status}
            data-aw-symbol={run?.symbol ?? ''}
        >
            <Panel id="agent-world-floor">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-4">
                    <SectionHeading spacing="none">{FLOOR_COPY.heading}</SectionHeading>
                    <Badge tone={session.status === 'failed' ? 'warning' : 'brand'} data-aw-status-badge>{STATUS_COPY[session.status]}</Badge>
                    <Badge tone="neutral">{KIND_COPY[session.kind]}</Badge>
                    {session.kind === 'preview' && <Badge tone="warning">{FLOOR_COPY.previewBadge}</Badge>}
                    <span className="text-xs text-fg-muted" data-aw-connection aria-live="polite">{connection}</span>
                    <div className="ml-auto flex flex-wrap items-center gap-2">
                        {canReplay && mode !== 'replay' && (
                            <ActionButton variant="secondary" size="sm" data-aw-replay title={REPLAY_COPY.note(REPLAY_MS / 1000)} onClick={startReplay}>{REPLAY_COPY.start}</ActionButton>
                        )}
                        {mode === 'replay' && (
                            <ActionButton variant="secondary" size="sm" data-aw-replay-stop onClick={() => dispatch({type: 'replay-stop'})}>{REPLAY_COPY.stop}</ActionButton>
                        )}
                        {owner && enabled && <RunNowButton live={live} onStarted={kick} />}
                    </div>
                </div>

                {session.symbols.length > 1 && (
                    <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label={FLOOR_COPY.lanes}>
                        <MicroLabel className="mr-1">{FLOOR_COPY.lanes}</MicroLabel>
                        {session.symbols.map((symbol) => {
                            const status = laneStatus(shown.runs.find((r) => r.symbol === symbol), session.runs.find((r) => r.symbol === symbol));
                            const active = run?.symbol === symbol;
                            return (
                                <ActionButton
                                    key={symbol}
                                    variant={active ? 'strong' : 'secondary'}
                                    size="xs"
                                    data-aw-lane={symbol}
                                    data-status={status}
                                    aria-pressed={active}
                                    onClick={() => dispatch({type: 'pick', symbol})}
                                >
                                    <span className="font-mono">{symbol}</span> <span className="opacity-80">{RUN_STATUS_COPY[status]}</span>
                                </ActionButton>
                            );
                        })}
                        {state.pinned && <ActionButton variant="secondary" size="xs" data-aw-follow onClick={() => dispatch({type: 'follow'})}>{FLOOR_COPY.follow}</ActionButton>}
                    </div>
                )}

                <StageStrip stages={stageViews(run)} now={serverNow} />
                <div className="mt-4">{terms.strip}</div>
            </Panel>

            <Panel id="agent-world-reports">
                <SectionHeading>{FLOOR_COPY.reportsHeading}</SectionHeading>
                <ReportRail key={`${session.sessionId}:${run?.symbol ?? ''}`} run={run} />
                <div className="mt-4">{terms.reports}</div>
            </Panel>

            <Panel id="agent-world-decision">
                <DecisionPanel session={session} owner={owner} enabled={enabled} now={serverNow} ratingTitle={ratingTitle} onDecided={pollNow} />
                <div className="mt-4">{terms.decision}</div>
            </Panel>
        </div>
    );
};

export default LiveFloor;
