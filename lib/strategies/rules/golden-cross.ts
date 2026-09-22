// Golden Cross Sectors: state-based, evaluated daily. A sector ETF is targeted
// while SMA50 is strictly above SMA200 and exited when it is not. Held slots
// receive a "hold" target so the rebalancer can apply the drift band.

import {slotWeight} from '@/lib/strategies/config';
import {closesOf, sma} from '@/lib/strategies/indicators';
import type {Decide, SignalRow, Target} from '@/lib/strategies/types';
import {
    finishDecision,
    fmtPct,
    fmtPrice,
    heldPositions,
    lastClose,
    readParam,
    universeOf,
} from '@/lib/strategies/rules/shared';

export const decide: Decide = (def, ctx) => {
    const fast = readParam(def, 'fast');
    const slow = readParam(def, 'slow');
    const needsNote = `needs ${slow} bars`;
    const held = heldPositions(ctx);
    const rows = new Map<string, SignalRow>();
    const targets: Target[] = [];
    const dataIssues: string[] = [];
    const weight = slotWeight(def.slots);

    for (const symbol of universeOf(def)) {
        if (!ctx.eligible.has(symbol)) continue;
        const bars = ctx.bars.get(symbol) ?? [];
        const close = lastClose(bars);
        if (close === null) continue;
        const closes = closesOf(bars);
        const fastAvg = sma(closes, fast);
        const slowAvg = sma(closes, slow);
        const isHeld = held.has(symbol);

        if (fastAvg === null || slowAvg === null) {
            rows.set(symbol, {
                symbol,
                state: 'excluded',
                values: {close, sma50: fastAvg, sma200: slowAvg, spread: null, trendOn: null},
                note: needsNote,
            });
            if (isHeld) dataIssues.push(`${symbol}: held but ${needsNote}; kept`);
            continue;
        }

        const spread = slowAvg > 0 ? fastAvg / slowAvg - 1 : null;
        const trendOn = fastAvg > slowAvg;
        const comparison = `SMA${fast} ${fmtPrice(fastAvg)} ${trendOn ? '>' : '≤'} SMA${slow} ${fmtPrice(slowAvg)}`;
        let state: SignalRow['state'] = 'watch';
        if (isHeld && !trendOn) {
            targets.push({symbol, weight: 0, reason: `exit: ${comparison}`});
            state = 'exit';
        } else if (trendOn) {
            const spreadText = spread === null ? '' : ` (${fmtPct(spread)})`;
            targets.push({symbol, weight, reason: `${isHeld ? 'hold' : 'enter'}: ${comparison}${spreadText}`});
            state = isHeld ? 'held' : 'enter';
        }
        rows.set(symbol, {symbol, state, values: {close, sma50: fastAvg, sma200: slowAvg, spread, trendOn}});
    }

    return finishDecision(def, ctx, {rebalanceTriggered: true, targets, rows, dataIssues});
};
