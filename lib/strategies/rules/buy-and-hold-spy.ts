// Buy & Hold SPY: one purchase on the first run, then nothing — the baseline.

import {isRebalanceDue} from '@/lib/strategies/calendar';
import type {Decide, SignalRow, Target} from '@/lib/strategies/types';
import {BENCHMARK_SYMBOL} from '@/lib/strategies/universe';
import {
    FULL_WEIGHT,
    finishDecision,
    heldPositions,
    lastClose,
    staleNote,
} from '@/lib/strategies/rules/shared';

export const decide: Decide = (def, ctx) => {
    const due = isRebalanceDue(def.cadence, ctx.tradeDate, ctx.lastRebalanceDate);
    const held = heldPositions(ctx);
    const holding = held.get(BENCHMARK_SYMBOL);
    const rows = new Map<string, SignalRow>();
    const targets: Target[] = [];
    const dataIssues: string[] = [];
    let rebalanceTriggered = false;

    const close = ctx.eligible.has(BENCHMARK_SYMBOL) ? lastClose(ctx.bars.get(BENCHMARK_SYMBOL) ?? []) : null;
    if (close !== null) {
        const sinceEntry = holding && holding.avgCost > 0 ? close / holding.avgCost - 1 : null;
        let state: SignalRow['state'] = holding ? 'held' : 'watch';
        if (due && !holding) {
            targets.push({symbol: BENCHMARK_SYMBOL, weight: FULL_WEIGHT, reason: 'initial deployment: buy and hold SPY'});
            state = 'enter';
        }
        // Done only once SPY is actually held: a bounced fill (a gap-up through the cash
        // floor) is re-planned on the next fresh day instead of leaving the baseline in cash.
        rebalanceTriggered = due && holding !== undefined;
        rows.set(BENCHMARK_SYMBOL, {symbol: BENCHMARK_SYMBOL, state, values: {close, sinceEntry}});
    } else if (due) {
        // Deferred, not skipped: the purchase is retried on the next fresh day.
        dataIssues.push(`${BENCHMARK_SYMBOL}: ${staleNote(ctx.asOf)}; initial purchase deferred`);
    }

    return finishDecision(def, ctx, {rebalanceTriggered, targets, rows, dataIssues});
};
