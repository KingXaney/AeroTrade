// RSI-2 Mean Reversion (Connors): buy an uptrending large cap on a two-day
// oversold reading, sell it on the first close above its 5-day average.

import {closesOf, sma, wilderRsi} from '@/lib/strategies/indicators';
import type {Decide} from '@/lib/strategies/types';
import {decideSlots, fmtPrice, lastClose, readParam} from '@/lib/strategies/rules/shared';

export const decide: Decide = (def, ctx) => {
    const rsiPeriod = readParam(def, 'rsiPeriod');
    const entryRsi = readParam(def, 'entryRsi');
    const exitSmaLength = readParam(def, 'exitSma');
    const trendSmaLength = readParam(def, 'trendSma');
    const needsNote = `needs ${trendSmaLength} bars`;

    return decideSlots(def, ctx, (bars) => {
        const close = lastClose(bars);
        if (close === null) return null;
        const closes = closesOf(bars);
        const rsi2 = wilderRsi(closes, rsiPeriod);
        const sma5 = sma(closes, exitSmaLength);
        const sma200 = sma(closes, trendSmaLength);
        const aboveSma200 = sma200 === null ? null : close > sma200;
        const values = {close, rsi2, sma5, sma200, aboveSma200};

        // The exit needs only the short average, so a held name can still leave
        // even on a day the entry indicators are not all computable.
        const exit = sma5 !== null && close > sma5
            ? `exit: close ${fmtPrice(close)} > SMA${exitSmaLength} ${fmtPrice(sma5)}`
            : undefined;
        if (rsi2 === null || sma5 === null || sma200 === null) {
            return {close, values, exit, excluded: needsNote};
        }
        const entry = close > sma200 && rsi2 < entryRsi
            ? {
                score: rsi2,
                reason: `enter: RSI(${rsiPeriod}) ${rsi2.toFixed(1)} < ${entryRsi} with close ${fmtPrice(close)} above SMA${trendSmaLength} ${fmtPrice(sma200)}`,
            }
            : undefined;
        return {close, values, exit, entry};
    }, 'asc');
};
