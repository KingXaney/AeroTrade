// "since thesis: NVDA +4.1% · SPY +6.0%" on /brain's Active Theses: what a ticker and SPY
// each returned from the first close on or after the day its thesis began. The maths is here
// and pure; the one batched read that feeds it is lib/brain/queries.ts getSinceThesis (one
// getBarsForSymbols over every thesis ticker from the earliest date, one getBenchmarkIndex).
//
// Both legs are total returns on the same footing — closes with stored dividends reinvested
// (lib/prices/total-return.ts), the name's through totalReturnIndex, SPY's through the
// benchmark index — and over the same sessions: a leg that cannot be measured hides the line
// rather than printing half of it.

import type {Bar} from '@/lib/prices/signals';
import {totalReturnIndex, type IndexPoint} from '@/lib/prices/total-return';
import {getEasternDateString} from '@/lib/utils';

// The heaviest ten ticker theses get a line; the rest of the list is read without one.
export const SINCE_THESIS_MAX = 10;

export type ThesisRef = {key: string; type: BrainEntityType; weightSlow: number; thesisSince: number | null};
export type SinceThesisTarget = {symbol: string; since: string};
export type SinceThesisLegs = {from: string; to: string; symbolPct: number; spyPct: number};

export const sinceThesisTargets = (theses: readonly ThesisRef[]): SinceThesisTarget[] =>
    theses
        .filter((t): t is ThesisRef & {thesisSince: number} => t.type === 'ticker' && typeof t.thesisSince === 'number' && Number.isFinite(t.thesisSince))
        .sort((a, b) => b.weightSlow - a.weightSlow)
        .slice(0, SINCE_THESIS_MAX)
        .map((t) => ({symbol: t.key, since: getEasternDateString(new Date(t.thesisSince))}));

export const earliestSince = (targets: readonly SinceThesisTarget[]): string | null =>
    targets.reduce<string | null>((earliest, t) => (earliest === null || t.since < earliest ? t.since : earliest), null);

const firstOnOrAfter = (index: readonly IndexPoint[], date: string): IndexPoint | undefined => index.find((p) => p.date >= date);
const lastOnOrBefore = (index: readonly IndexPoint[], date: string): IndexPoint | undefined => {
    for (let i = index.length - 1; i >= 0; i -= 1) if (index[i].date <= date) return index[i];
    return undefined;
};

export const sinceThesisLegs = (since: string, symbolIndex: readonly IndexPoint[], spyIndex: readonly IndexPoint[]): SinceThesisLegs | null => {
    const base = firstOnOrAfter(symbolIndex, since);
    const symbolLast = symbolIndex[symbolIndex.length - 1];
    const spyLast = spyIndex[spyIndex.length - 1];
    if (!base || !symbolLast || !spyLast) return null;
    const to = symbolLast.date < spyLast.date ? symbolLast.date : spyLast.date;
    const symbolEnd = lastOnOrBefore(symbolIndex, to);
    const spyBase = firstOnOrAfter(spyIndex, base.date);
    const spyEnd = lastOnOrBefore(spyIndex, to);
    if (!symbolEnd || !spyBase || !spyEnd || spyBase.date !== base.date) return null;
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
    spyIndex: readonly IndexPoint[],
): Record<string, SinceThesisLegs> => {
    const out: Record<string, SinceThesisLegs> = {};
    for (const {symbol, since} of targets) {
        const legs = sinceThesisLegs(since, totalReturnIndex(barsBySymbol.get(symbol.toUpperCase()) ?? []), spyIndex);
        if (legs) out[symbol] = legs;
    }
    return out;
};
