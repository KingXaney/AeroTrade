// Donchian 55/20 Breakout (the Turtle channel rule, without ATR sizing): enter
// on a close strictly above the prior 55-bar high, exit on a close strictly
// below the prior 20-bar low. Both channels exclude today's bar.

import {rollingHigh, rollingLow} from '@/lib/strategies/indicators';
import type {Decide} from '@/lib/strategies/types';
import {decideSlots, fmtPct, fmtPrice, lastClose, readParam} from '@/lib/strategies/rules/shared';

export const decide: Decide = (def, ctx) => {
    const entryChannel = readParam(def, 'entryChannel');
    const exitChannel = readParam(def, 'exitChannel');
    const needsNote = `needs ${entryChannel + 1} bars with highs/lows`;

    return decideSlots(def, ctx, (bars) => {
        const close = lastClose(bars);
        if (close === null) return null;
        const high55 = rollingHigh(bars, entryChannel);
        const low20 = rollingLow(bars, exitChannel);
        const vsHigh = high55 !== null && high55 > 0 ? close / high55 - 1 : null;
        const values = {close, high55, low20, vsHigh};

        const exit = low20 !== null && close < low20
            ? `exit: close ${fmtPrice(close)} < ${exitChannel}-day low ${fmtPrice(low20)}`
            : undefined;
        if (high55 === null || low20 === null || vsHigh === null) {
            return {close, values, exit, excluded: needsNote};
        }
        const entry = close > high55
            ? {
                score: vsHigh,
                reason: `enter: close ${fmtPrice(close)} broke the ${entryChannel}-day high ${fmtPrice(high55)} (${fmtPct(vsHigh)})`,
            }
            : undefined;
        return {close, values, exit, entry};
    }, 'desc');
};
