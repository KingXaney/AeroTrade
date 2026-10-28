'use client';

import type {ReactNode} from "react";
import RatingBadge from "@/components/agent-world/RatingBadge";
import {ACTIVE_STATUSES, seatDot, seatEdge} from "@/components/agent-world/office/office-look";
import Badge from "@/components/primitives/Badge";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";
import StatTile from "@/components/primitives/StatTile";
import type {WorkerId} from "@/lib/agent-world/config";
import type {OfficeState} from "@/lib/agent-world/office";
import {elapsedText, formatCents, formatTokens} from "@/lib/agent-world/page-view";
import {RUN_STATUS_COPY, STATUS_COPY} from "@/lib/learn/copy/agent-world";
import {OFFICE_COPY, SCOREBOARD_COPY, TICKER_COPY, WORKER_STATUS_COPY, workerName} from "@/lib/learn/copy/agent-world-office";
import {formatPct} from "@/lib/format";
import {cn} from "@/lib/utils";

// The office's side column: the wall (the session's totals and every session's, the account
// beside SPY, neutral and never reordered), the fourteen seats in the order a run reaches them (the
// roster a keyboard or a screen reader uses), and the newest events as sentences.

type WallProps = {
    office: OfficeState;
    pinned: boolean;
    onPick: (symbol: string) => void;
    onFollow: () => void;
    ratingTitle: string;
    nextSessionNote: string | null;
    terms: ReactNode;
};

export const OfficeWall = ({office, pinned, onPick, onFollow, ratingTitle, nextSessionNote, terms}: WallProps) => {
    const b = office.scoreboard;
    const labels = SCOREBOARD_COPY.labels;
    return (
        <Panel pad={4} data-testid="office-wall">
            <div data-office-scoreboard className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <SectionHeading size="sm" spacing="none">{SCOREBOARD_COPY.heading}</SectionHeading>
                    <div className="flex items-center gap-2">
                        {b.status && <span data-office-stat="status"><Badge tone={b.status === 'failed' ? 'warning' : 'brand'}>{STATUS_COPY[b.status]}</Badge></span>}
                        {b.elapsed && <span className="font-mono text-xs tabular-nums text-fg-muted" data-office-stat="elapsed">{b.elapsed}</span>}
                    </div>
                </div>
                {b.symbols.length > 0 && (
                    <div>
                        <p className="label-type mb-1 text-[10px] text-fg-muted">{SCOREBOARD_COPY.lanes}</p>
                        <div className="flex flex-wrap gap-1.5">
                            {b.ratings.map((rating) => (
                                <button key={rating.symbol} type="button" data-office-lane={rating.symbol} aria-pressed={office.symbol === rating.symbol} onClick={() => onPick(rating.symbol)}
                                    className={cn('flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-brand',
                                        office.symbol === rating.symbol ? 'border-brand bg-brand/10 text-fg' : 'border-line text-fg-soft hover:text-fg')}>
                                    <span className="font-mono">{rating.symbol}</span>
                                    {rating.rating ? <span data-office-rating={rating.symbol}><RatingBadge rating={rating.rating} title={ratingTitle} /></span> : <span className="text-[10px] text-fg-muted">{RUN_STATUS_COPY[rating.status]}</span>}
                                </button>
                            ))}
                            {pinned && <button type="button" data-office-follow-lane onClick={onFollow} className="rounded-md px-2 py-1 text-xs text-brand underline-offset-2 hover:underline">{OFFICE_COPY.follow}</button>}
                        </div>
                    </div>
                )}
                <div className="grid grid-cols-2 gap-x-3 gap-y-2" data-office-figures>
                    <span data-office-stat="calls"><StatTile size="sm" label={labels.calls} value={b.calls.toLocaleString('en-US')} /></span>
                    <span data-office-stat="fetches"><StatTile size="sm" label={labels.fetches} value={b.fetches.toLocaleString('en-US')} /></span>
                    <span data-office-stat="tokens"><StatTile size="sm" label={labels.tokens} value={`${formatTokens(b.tokensIn)} / ${formatTokens(b.tokensOut)}`} /></span>
                    <span data-office-stat="cost"><StatTile size="sm" label={labels.cost} value={formatCents(b.costCents)} /></span>
                    {b.refusals > 0 && <span data-office-stat="refusals"><StatTile size="sm" label={labels.refusals} value={String(b.refusals)} /></span>}
                    <span data-office-stat="sessions"><StatTile size="sm" label={labels.sessions} value={b.sessionsToDate.toLocaleString('en-US')} /></span>
                    <span data-office-stat="cost-to-date"><StatTile size="sm" label={labels.costToDate} value={formatCents(b.costToDateCents)} /></span>
                </div>
                <div className="grid grid-cols-2 gap-x-3" data-office-record>
                    {b.record.map((row) => (
                        <span key={row.id} data-office-stat={row.id}>
                            <StatTile size="sm" label={row.id === 'desk' ? labels.desk : labels.spy} value={formatPct(row.returnPct)} hint={row.since ? SCOREBOARD_COPY.since(row.since) : SCOREBOARD_COPY.notStarted} />
                        </span>
                    ))}
                </div>
                {nextSessionNote && office.mode === 'idle' && <p className="text-xs text-fg-muted" data-office-stat="next">{nextSessionNote}</p>}
                <p className="text-xs text-fg-muted">{SCOREBOARD_COPY.lead}</p>
                {terms}
            </div>
        </Panel>
    );
};

export const OfficeRoster = ({office, selected, onOpen}: {office: OfficeState; selected: WorkerId | null; onOpen: (id: WorkerId) => void}) => (
    <Panel pad={4}>
        <SectionHeading size="sm">{OFFICE_COPY.rosterLabel}</SectionHeading>
        <ol aria-label={OFFICE_COPY.rosterLabel} className="space-y-1" data-office-roster>
            {office.workers.map((worker) => (
                <li key={worker.id}>
                    <button type="button" data-office-worker={worker.id} data-status={worker.status} data-task={worker.task} aria-pressed={selected === worker.id} onClick={() => onOpen(worker.id)}
                        className={cn('relative flex w-full items-start gap-2 overflow-hidden rounded-md py-1.5 pl-3 pr-2 text-left transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-brand',
                            selected === worker.id && 'bg-brand/10', office.focus === worker.id && 'bg-surface-2')}>
                        <span aria-hidden="true" className={cn('absolute inset-y-1 left-0 w-[3px] rounded-r', seatEdge(worker.id))} />
                        <span aria-hidden="true" className={cn('mt-1.5 size-2 shrink-0 rounded-full', seatDot(worker.status), ACTIVE_STATUSES.has(worker.status) && 'ao-lamp')} />
                        <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-2">
                                <span className="truncate text-sm font-medium text-fg">{workerName(worker.id)}</span>
                                <span className="shrink-0 text-[11px] text-fg-muted">
                                    {WORKER_STATUS_COPY[worker.status]}
                                    {ACTIVE_STATUSES.has(worker.status) && worker.since !== null && <span className="ml-1 font-mono tabular-nums">{elapsedText(worker.since, null, office.now)}</span>}
                                </span>
                            </span>
                            <span className="block truncate text-xs text-fg-soft" title={worker.task}>{worker.task}</span>
                        </span>
                    </button>
                </li>
            ))}
        </ol>
    </Panel>
);

export const OfficeTicker = ({office}: {office: OfficeState}) => (
    <Panel pad={4}>
        <SectionHeading size="sm">{OFFICE_COPY.tickerLabel}</SectionHeading>
        {office.ticker.length === 0 ? <p className="text-sm text-fg-muted">{TICKER_COPY.empty}</p> : (
            <ol data-office-ticker aria-live="polite" className="space-y-1.5">
                {office.ticker.map((line) => (
                    <li key={line.id} className="ao-line-in text-xs leading-snug text-fg-soft">
                        <span className="font-mono text-[10px] tabular-nums text-fg-muted">{OFFICE_COPY.clock(line.clock)}</span>
                        <span className="text-fg-muted"> · </span>
                        {line.text}
                    </li>
                ))}
            </ol>
        )}
    </Panel>
);
