// Dual Momentum (GEM): monthly, on total-return (adjClose) 12-month returns.
// Absolute momentum against the T-bill ETF decides stocks vs bonds; relative
// momentum picks SPY vs EFA. Anything uncertain defers the rebalance rather than
// selling into cash on partial data.

import {isRebalanceDue} from '@/lib/strategies/calendar';
import {closesOf, trailingReturn} from '@/lib/strategies/indicators';
import type {Decide, SignalRow, Target} from '@/lib/strategies/types';
import {BENCHMARK_SYMBOL} from '@/lib/strategies/universe';
import {
    FULL_WEIGHT,
    finishDecision,
    fmtPct,
    heldPositions,
    lastClose,
    readParam,
    staleNote,
    universeOf,
} from '@/lib/strategies/rules/shared';

const INTERNATIONAL_ETF = 'EFA';
const BOND_ETF = 'AGG';
const TBILL_ETF = 'BIL';

export const decide: Decide = (def, ctx) => {
    const lookback = readParam(def, 'lookback');
    const due = isRebalanceDue(def.cadence, ctx.tradeDate, ctx.lastRebalanceDate);
    const held = heldPositions(ctx);
    const universe = universeOf(def);
    const rows = new Map<string, SignalRow>();
    const targets: Target[] = [];
    const dataIssues: string[] = [];

    // Returns are computed from whatever history exists, stale or not, so the board
    // can always show them; only the pick's freshness gates the trade.
    const returns = new Map<string, number | null>();
    for (const symbol of universe) {
        const bars = ctx.bars.get(symbol) ?? [];
        returns.set(symbol, bars.length > 0 ? trailingReturn(closesOf(bars, 'adjClose'), lookback) : null);
    }
    const rSpy = returns.get(BENCHMARK_SYMBOL) ?? null;
    const rEfa = returns.get(INTERNATIONAL_ETF) ?? null;
    const rBil = returns.get(TBILL_ETF) ?? null;
    const hurdle = rBil ?? 0;

    let pick: string | null = null;
    let pickReason = '';
    if (rSpy !== null && rEfa !== null) {
        const spyText = `${BENCHMARK_SYMBOL} 12m ${fmtPct(rSpy)}`;
        const billText = `T-bill ${fmtPct(hurdle)}`;
        if (rSpy > hurdle) {
            pick = rSpy >= rEfa ? BENCHMARK_SYMBOL : INTERNATIONAL_ETF;
            const relation = rSpy >= rEfa ? 'and ≥' : 'but <';
            pickReason = `monthly: ${spyText} > ${billText} ${relation} ${INTERNATIONAL_ETF} ${fmtPct(rEfa)} → ${pick}`;
        } else {
            pick = BOND_ETF;
            pickReason = `monthly: ${spyText} ≤ ${billText} → ${BOND_ETF} (absolute momentum off)`;
        }
    }

    let rebalanceTriggered = false;
    if (due) {
        if (pick === null) {
            dataIssues.push(`${BENCHMARK_SYMBOL}/${INTERNATIONAL_ETF} ${lookback}-bar total return unavailable; rebalance deferred`);
        } else if (!ctx.eligible.has(pick)) {
            dataIssues.push(`${pick}: ${staleNote(ctx.asOf)}; rebalance deferred`);
        } else {
            if (rBil === null) dataIssues.push(`${TBILL_ETF} history missing; hurdle 0`);
            rebalanceTriggered = true;
            targets.push({symbol: pick, weight: FULL_WEIGHT, reason: pickReason});
            for (const symbol of universe) {
                if (symbol !== pick && held.has(symbol)) {
                    targets.push({symbol, weight: 0, reason: `exit: rotated to ${pick}`});
                }
            }
        }
    }

    for (const symbol of universe) {
        if (!ctx.eligible.has(symbol)) continue;
        const close = lastClose(ctx.bars.get(symbol) ?? []);
        if (close === null) continue;
        const r12 = returns.get(symbol) ?? null;
        const aboveHurdle = symbol === TBILL_ETF || r12 === null ? null : r12 > hurdle;
        const isHeld = held.has(symbol);
        let state: SignalRow['state'] = isHeld ? 'held' : 'watch';
        if (rebalanceTriggered) {
            if (symbol === pick) state = isHeld ? 'held' : 'enter';
            else if (isHeld) state = 'exit';
        }
        rows.set(symbol, {symbol, state, values: {close, r12, aboveHurdle, pick: pick === null ? null : symbol === pick}});
    }

    return finishDecision(def, ctx, {rebalanceTriggered, targets, rows, dataIssues});
};
