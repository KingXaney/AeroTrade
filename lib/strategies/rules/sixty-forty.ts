// 60/40 Quarterly: two fixed legs, put back to target on the first fresh run of
// each quarter. The 2% drift band (applied by the rebalancer) decides whether a
// leg actually trades; this rule only states the targets.

import {isRebalanceDue} from '@/lib/strategies/calendar';
import type {Decide, SignalRow, Target} from '@/lib/strategies/types';
import {BENCHMARK_SYMBOL} from '@/lib/strategies/universe';
import {
    FULL_WEIGHT,
    finishDecision,
    fmtPctUnsigned,
    heldPositions,
    holdingWeight,
    lastClose,
    readParam,
    staleNote,
} from '@/lib/strategies/rules/shared';

const BOND_ETF = 'AGG';

export const decide: Decide = (def, ctx) => {
    const legs = [
        {symbol: BENCHMARK_SYMBOL, target: readParam(def, 'spyWeight') * FULL_WEIGHT},
        {symbol: BOND_ETF, target: readParam(def, 'aggWeight') * FULL_WEIGHT},
    ];
    const due = isRebalanceDue(def.cadence, ctx.tradeDate, ctx.lastRebalanceDate);
    const held = heldPositions(ctx);
    const rows = new Map<string, SignalRow>();
    const targets: Target[] = [];
    const dataIssues: string[] = [];

    const staleLegs = legs.filter((leg) => !ctx.eligible.has(leg.symbol)).map((leg) => leg.symbol);
    // Never rebalance one leg against a stale other: the drift numbers would be wrong.
    const canRebalance = due && staleLegs.length === 0;
    if (due && staleLegs.length > 0) {
        dataIssues.push(`${staleLegs.join(', ')}: ${staleNote(ctx.asOf)}; quarterly rebalance deferred`);
    }

    for (const leg of legs) {
        if (!ctx.eligible.has(leg.symbol)) continue;
        const close = lastClose(ctx.bars.get(leg.symbol) ?? []);
        if (close === null) continue;
        const holding = held.get(leg.symbol);
        const weight = holdingWeight(ctx, holding) ?? (holding ? null : 0);
        const drift = weight === null ? null : weight - leg.target;
        let state: SignalRow['state'] = holding ? 'held' : 'watch';
        if (canRebalance) {
            const current = weight === null ? 'unpriced' : fmtPctUnsigned(weight);
            const prefix = holding ? 'quarterly rebalance' : 'enter';
            targets.push({
                symbol: leg.symbol,
                weight: leg.target,
                reason: `${prefix}: ${leg.symbol} ${current} → ${fmtPctUnsigned(leg.target)} target`,
            });
            if (!holding) state = 'enter';
        }
        rows.set(leg.symbol, {symbol: leg.symbol, state, values: {close, weight, target: leg.target, drift}});
    }

    return finishDecision(def, ctx, {rebalanceTriggered: canRebalance, targets, rows, dataIssues});
};
