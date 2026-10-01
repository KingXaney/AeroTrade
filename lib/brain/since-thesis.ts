// "since thesis: NVDA +4.1% · SPY +6.0%" on /brain's Active Theses: what a ticker and SPY
// each returned from the first close on or after the day its thesis began. The maths is here
// and pure; the batched read that feeds it is lib/brain/store.ts getSinceThesis (each thesis
// ticker's bars from its own thesis date, SPY's from the earliest one).
//
// Both legs are total returns on the same footing — closes with stored dividends reinvested on
// their pay dates (lib/prices/total-return.ts) — for a holder who bought at the base close: a
// dividend counts only when its ex-date is after the base, the way the income clock pays one
// (to the shares held the evening before the ex-date), so a dividend declared before the thesis
// and paid after it is never credited to either leg. Over the same sessions: a leg that cannot
// be measured hides the line rather than printing half of it.

import type {Bar} from '@/lib/prices/signals';
import {totalReturnIndex, type IndexPoint} from '@/lib/prices/total-return';
import {getEasternDateString} from '@/lib/dates';
import type {BrainEntityType} from '@/lib/brain/types';

// The heaviest ten ticker theses get a line; the rest of the list is read without one.
export const SINCE_THESIS_MAX = 10;

export type ThesisRef = {key: string; type: BrainEntityType; weightSlow: number; thesisSince: number | null};
type SinceThesisTarget = {symbol: string; since: string};
export type SinceThesisLegs = {from: string; to: string; symbolPct: number; spyPct: number};

export const sinceThesisTargets = (theses: readonly ThesisRef[]): SinceThesisTarget[] =>
    theses
        .filter((t): t is ThesisRef & {thesisSince: number} => t.type === 'ticker' && typeof t.thesisSince === 'number' && Number.isFinite(t.thesisSince))
        .sort((a, b) => b.weightSlow - a.weightSlow)
        .slice(0, SINCE_THESIS_MAX)
        .map((t) => ({symbol: t.key, since: getEasternDateString(new Date(t.thesisSince))}));

export const earliestSince = (targets: readonly SinceThesisTarget[]): string | null =>
    targets.reduce<string | null>((earliest, t) => (earliest === null || t.since < earliest ? t.since : earliest), null);

const lastOnOrBefore = (index: readonly IndexPoint[], date: string): IndexPoint | undefined => {
    for (let i = index.length - 1; i >= 0; i -= 1) if (index[i].date <= date) return index[i];
    return undefined;
};

// The total-return index a holder from `base`'s close sees: the bars from `base` on, `base`'s
// own dividend dropped (an ex-date on the buy day is the seller's), each later one reinvested.
const indexFromBase = (bars: readonly Bar[], base: string): IndexPoint[] =>
    totalReturnIndex(bars
        .filter((bar) => bar.date >= base)
        .map((bar) => (bar.date === base && bar.dividend !== undefined ? {date: bar.date, close: bar.close} : bar)));

export const sinceThesisLegs = (since: string, symbolBars: readonly Bar[], spyBars: readonly Bar[]): SinceThesisLegs | null => {
    const baseBar = symbolBars.find((bar) => bar.date >= since);
    if (!baseBar) return null;
    const symbolIndex = indexFromBase(symbolBars, baseBar.date);
    const spyIndex = indexFromBase(spyBars, baseBar.date);
    const base = symbolIndex[0];
    const spyBase = spyIndex[0];
    const symbolLast = symbolIndex[symbolIndex.length - 1];
    const spyLast = spyIndex[spyIndex.length - 1];
    if (!base || !spyBase || !symbolLast || !spyLast || spyBase.date !== base.date) return null;
    const to = symbolLast.date < spyLast.date ? symbolLast.date : spyLast.date;
    const symbolEnd = lastOnOrBefore(symbolIndex, to);
    const spyEnd = lastOnOrBefore(spyIndex, to);
    if (!symbolEnd || !spyEnd) return null;
    if (!(symbolEnd.date > base.date) || symbolEnd.date !== spyEnd.date) return null;
    if (!(base.value > 0) || !(symbolEnd.value > 0) || !(spyBase.value > 0) || !(spyEnd.value > 0)) return null;
    return {
        from: base.date,
        to: symbolEnd.date,
        symbolPct: (symbolEnd.value / base.value - 1) * 100,
        spyPct: (spyEnd.value / spyBase.value - 1) * 100,
    };
};

export const sinceThesisBySymbol = (
    targets: readonly SinceThesisTarget[],
    barsBySymbol: ReadonlyMap<string, readonly Bar[]>,
    spyBars: readonly Bar[],
): Record<string, SinceThesisLegs> => {
    const out: Record<string, SinceThesisLegs> = {};
    for (const {symbol, since} of targets) {
        const legs = sinceThesisLegs(since, barsBySymbol.get(symbol.toUpperCase()) ?? [], spyBars);
        if (legs) out[symbol] = legs;
    }
    return out;
};
