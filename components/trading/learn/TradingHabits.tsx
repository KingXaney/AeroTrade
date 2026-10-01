import type {HabitsRead} from "@/lib/trading/learn/habits-store";
import {cadenceControls, HABITS_MIN_CLOSED_LOTS} from "@/lib/trading/learn/habits";
import {STRATEGIES} from "@/lib/strategies/catalog";
import {HABITS_COPY, HABITS_TERMS} from "@/lib/learn/copy/habits";
import StatTile from "@/components/primitives/StatTile";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";
import EmptyState from "@/components/primitives/EmptyState";
import Term from "@/components/primitives/Term";
import WhatTheseMean from "@/components/learn/WhatTheseMean";

// "Trading habits": plain-word tiles over the learner's own lots (lib/trading/learn/habits.ts) — how
// long winners and losers were held, the share of each that was sold, how often and how much
// was traded beside the catalog's own cadences, and what the shares sold would be worth now.
// The jargon (time held, disposition effect, turnover) lives in the one "What these mean".
// Server component; a page panel only, never a dashboard widget.

const TradingHabits = ({read}: {read: HabitsRead}) => {
    const {habits} = read;
    if (!habits) {
        return (
            <Panel id="trading-habits" aria-labelledby="habits-heading">
                <SectionHeading id="habits-heading" spacing="sm">{HABITS_COPY.heading}</SectionHeading>
                <EmptyState title={HABITS_COPY.emptyTitle(HABITS_MIN_CLOSED_LOTS)} description={HABITS_COPY.emptyDescription(read.closedLots)} className="px-0" />
            </Panel>
        );
    }
    const held = habits.hadYouHeld;
    const unpricedNote = HABITS_COPY.unpricedOpen(habits.sold.unpricedOpen);

    return (
        <Panel id="trading-habits" aria-labelledby="habits-heading">
            <SectionHeading id="habits-heading" spacing="sm">{HABITS_COPY.heading}</SectionHeading>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div data-testid="habits-hold">
                    <StatTile label={<Term k="hold-time">{HABITS_COPY.holdLabel}</Term>} value={HABITS_COPY.holdValue(habits.hold)} hint={HABITS_COPY.holdHint(habits.hold)} />
                </div>
                <div data-testid="habits-sold">
                    <StatTile label={<Term k="disposition-effect">{HABITS_COPY.soldLabel}</Term>} value={HABITS_COPY.soldValue(habits.sold)} hint={HABITS_COPY.soldHint(habits.sold)} />
                </div>
                <div data-testid="habits-pace">
                    <StatTile label={<Term k="trades">{HABITS_COPY.paceLabel}</Term>} value={HABITS_COPY.paceValue(habits.pace)} hint={HABITS_COPY.paceHint(habits.pace)} />
                </div>
                <div data-testid="habits-turnover">
                    <StatTile label={<Term k="turnover">{HABITS_COPY.turnoverLabel}</Term>} value={HABITS_COPY.turnoverValue(habits.turnover)} hint={HABITS_COPY.turnoverHint(habits.turnover)} />
                </div>
                {held && (
                    <div data-testid="habits-held">
                        <StatTile label={<Term k="had-you-held">{HABITS_COPY.heldLabel}</Term>} value={HABITS_COPY.heldValue(held)} hint={HABITS_COPY.heldHint(held)} />
                        <p className="mt-0.5 font-mono text-[10px] text-fg-muted">{HABITS_COPY.heldScope(held)}</p>
                    </div>
                )}
            </div>
            {unpricedNote && <p className="mt-3 font-mono text-[11px] text-fg-muted" data-testid="habits-unpriced">{unpricedNote}</p>}
            <p className="mt-2 font-mono text-[11px] text-fg-muted" data-testid="habits-cadence">
                {HABITS_COPY.cadenceLine(cadenceControls(STRATEGIES), habits.pace.sessions)}
            </p>
            <WhatTheseMean keys={HABITS_TERMS.filter((key) => key !== 'had-you-held' || held)}>
                <p className="text-xs text-fg-muted leading-relaxed" data-testid="habits-method">{HABITS_COPY.method}</p>
            </WhatTheseMean>
        </Panel>
    );
};

export default TradingHabits;
