// Stock splits, pure: which fills are in old shares, what they read as in today's, and what the
// holding is once they are restated.

import {describe, expect, it} from 'vitest';
import {easternToInstant} from '@/lib/prices/market-hours';
import {
    cutFor,
    describeSplitRun,
    factorAt,
    isSplit,
    looksLikeSplit,
    positionFromFills,
    restateDividend,
    restateFill,
    snapShares,
    splitInstant,
    splitKey,
    splitLabel,
    toAppliedSplits,
    type AppliedSplit,
    type StockSplitEvent,
} from '@/lib/trading/splits';

// Monday 2024-06-10: NVDA's 10-for-1. The Friday before is 2024-06-07.
const EX = '2024-06-10';
const at = (date: string, hh: number, mm = 0): number => easternToInstant(date, hh, mm);
const tenForOne: AppliedSplit = {symbol: 'NVDA', exDate: EX, numerator: 10, denominator: 1, before: splitInstant(EX)};
const event: StockSplitEvent = {symbol: 'NVDA', exDate: EX, numerator: 10, denominator: 1, at: splitInstant(EX), prevClose: 120.89};

describe('a split', () => {
    it('takes effect at the ex-date\'s open', () => {
        expect(splitInstant(EX)).toBe(at(EX, 9, 30));
    });

    it('is a ratio of two positive numbers that differ', () => {
        expect(isSplit({numerator: 10, denominator: 1})).toBe(true);
        expect(isSplit({numerator: 1, denominator: 10})).toBe(true);
        expect(isSplit({numerator: 1, denominator: 1})).toBe(false);
        expect(isSplit({numerator: 0, denominator: 1})).toBe(false);
        expect(isSplit({numerator: Number.NaN, denominator: 1})).toBe(false);
    });

    it('is keyed by its symbol and ex-date', () => {
        expect(splitKey({symbol: 'nvda', exDate: EX})).toBe('NVDA|2024-06-10');
    });
});

describe('factorAt', () => {
    it('is nothing for a fill at or after the cut, or of another symbol', () => {
        expect(factorAt([tenForOne], 'NVDA', at(EX, 9, 30))).toBeNull();
        expect(factorAt([tenForOne], 'NVDA', at(EX, 15))).toBeNull();
        expect(factorAt([tenForOne], 'AAPL', at('2024-06-07', 10))).toBeNull();
        expect(factorAt([], 'NVDA', 0)).toBeNull();
    });

    it('is the ratio for a fill before the cut', () => {
        expect(factorAt([tenForOne], 'nvda', at('2024-06-07', 10))).toEqual({numerator: 10, denominator: 1});
    });

    it('compounds every later split', () => {
        const second: AppliedSplit = {symbol: 'NVDA', exDate: '2025-06-09', numerator: 3, denominator: 2, before: splitInstant('2025-06-09')};
        expect(factorAt([tenForOne, second], 'NVDA', at('2024-06-07', 10))).toEqual({numerator: 30, denominator: 2});
        expect(factorAt([tenForOne, second], 'NVDA', at('2024-12-02', 10))).toEqual({numerator: 3, denominator: 2});
    });
});

describe('restateFill', () => {
    const buy = {symbol: 'NVDA', side: 'buy' as const, quantity: 10, price: 1200, total: 12_000, createdAt: at('2024-06-07', 10)};

    it('reads a fill from before the split in today\'s shares, its dollars untouched', () => {
        const restated = restateFill(buy, [tenForOne]);
        expect(restated).toEqual({...buy, quantity: 100, price: 120, restated: true});
        expect(restated.quantity * restated.price).toBe(buy.total);
    });

    it('hands back the same fill when no split applies', () => {
        expect(restateFill(buy, [])).toBe(buy);
        const later = {...buy, createdAt: at(EX, 10)};
        expect(restateFill(later, [tenForOne])).toBe(later);
    });

    it('restates a reverse split into fewer shares', () => {
        const reverse: AppliedSplit = {symbol: 'XYZ', exDate: EX, numerator: 1, denominator: 10, before: splitInstant(EX)};
        const fill = {symbol: 'XYZ', side: 'buy' as const, quantity: 15, price: 2, total: 30, createdAt: at('2024-06-07', 10)};
        expect(restateFill(fill, [reverse])).toMatchObject({quantity: 1.5, price: 20});
    });
});

describe('cutFor', () => {
    it('is the split\'s own instant when no fill is near it', () => {
        expect(cutFor(event, [])).toBe(event.at);
        expect(cutFor(event, [{createdAt: at('2024-06-05', 11), price: 1164}])).toBe(event.at);
    });

    it('keeps a weekend fill at the old price in old shares', () => {
        // Filled Sunday night at Friday's close, in old shares.
        const sunday = at('2024-06-09', 20);
        expect(cutFor(event, [{createdAt: sunday, price: 1208.88}])).toBe(event.at);
    });

    it('moves the cut back to a pre-open fill already at the new price', () => {
        const early = at(EX, 8);
        expect(cutFor(event, [{createdAt: early, price: 121.4}])).toBe(early);
    });

    it('moves the cut past a fill just after the open that was still at the old price', () => {
        const late = at(EX, 9, 31);
        expect(cutFor(event, [{createdAt: late, price: 1207}])).toBe(late + 1);
    });

    it('puts the cut at the first fill at the new price when both are there', () => {
        const old = at(EX, 9, 31);
        const fresh = at(EX, 9, 40);
        expect(cutFor(event, [{createdAt: fresh, price: 122}, {createdAt: old, price: 1207}])).toBe(fresh);
    });

    it('goes by the clock when the ratio is too small to tell by price, or no close is known', () => {
        const small: StockSplitEvent = {...event, numerator: 11, denominator: 10};
        expect(cutFor(small, [{createdAt: at(EX, 8), price: 121}])).toBe(small.at);
        const blind: StockSplitEvent = {symbol: 'NVDA', exDate: EX, numerator: 10, denominator: 1, at: event.at};
        expect(cutFor(blind, [{createdAt: at(EX, 8), price: 121}])).toBe(blind.at);
    });

    it('reads nothing into a fill after the ex-date\'s close', () => {
        expect(cutFor(event, [{createdAt: at('2024-06-11', 10), price: 1200}])).toBe(event.at);
    });
});

describe('positionFromFills', () => {
    const fill = (side: 'buy' | 'sell', quantity: number, price: number, createdAt: number) => ({side, quantity, price, createdAt});

    it('rebuilds a holding and its average cost from its fills', () => {
        expect(positionFromFills([fill('buy', 10, 100, 1), fill('buy', 10, 120, 2), fill('sell', 5, 130, 3)])).toEqual({quantity: 15, avgCost: 110});
    });

    it('is no holding when everything was sold, or nothing was traded', () => {
        expect(positionFromFills([fill('buy', 10, 100, 1), fill('sell', 10, 90, 2)])).toBeNull();
        expect(positionFromFills([])).toBeNull();
    });

    it('carries the fraction a restated fill has', () => {
        expect(positionFromFills([fill('buy', 7.5, 20, 1)])).toEqual({quantity: 7.5, avgCost: 20});
    });

    it('orders fills by time, whatever order they arrive in', () => {
        expect(positionFromFills([fill('sell', 5, 130, 3), fill('buy', 10, 100, 1)])).toEqual({quantity: 5, avgCost: 100});
    });

    it('says so when a sell has no shares behind it', () => {
        expect(positionFromFills([fill('sell', 5, 130, 1)])).toBeUndefined();
    });

    it('gives the same holding in today\'s shares once a split is applied', () => {
        const fills = [
            {symbol: 'NVDA', side: 'buy' as const, quantity: 10, price: 1200, createdAt: at('2024-06-07', 10)},
            {symbol: 'NVDA', side: 'buy' as const, quantity: 5, price: 122, createdAt: at(EX, 10)},
        ];
        expect(positionFromFills(fills.map((f) => restateFill(f, [tenForOne])))).toEqual({quantity: 105, avgCost: (12_000 + 610) / 105});
    });
});

describe('snapShares', () => {
    it('rounds a hair off a whole number to it, and leaves a real fraction alone', () => {
        expect(snapShares(2.3 - 0.3)).toBe(2);
        expect(snapShares(100.00000000001)).toBe(100);
        expect(snapShares(7.5)).toBe(7.5);
        expect(snapShares(10 / 3)).toBe(10 / 3);
    });

    it('is what a rebuilt holding is stored as', () => {
        const fill = (side: 'buy' | 'sell', quantity: number, createdAt: number) => ({side, quantity, price: 10, createdAt});
        expect(positionFromFills([fill('buy', 2.3, 1), fill('sell', 0.3, 2)])?.quantity).toBe(2);
    });
});

describe('looksLikeSplit', () => {
    it('is a quote far from the last stored close', () => {
        expect(looksLikeSplit(120, 1200)).toBe(true);
        expect(looksLikeSplit(30, 20)).toBe(true);
        expect(looksLikeSplit(114, 100)).toBe(false);
        expect(looksLikeSplit(86, 100)).toBe(false);
    });

    it('is nothing without a close to compare with', () => {
        expect(looksLikeSplit(120, null)).toBe(false);
        expect(looksLikeSplit(120, undefined)).toBe(false);
        expect(looksLikeSplit(120, 0)).toBe(false);
    });
});

describe('restateDividend', () => {
    const row = {symbol: 'NVDA', exDate: '2024-03-05', quantity: 10, perShare: 0.04, amount: 0.4};

    it('reads a dividend from before the split in today\'s shares', () => {
        expect(restateDividend(row, [tenForOne])).toEqual({...row, quantity: 100, perShare: 0.004});
    });

    it('leaves a row written after the account applied the split: it is in today\'s shares already', () => {
        const applied: AppliedSplit = {...tenForOne, appliedAt: at(EX, 9, 40)};
        // Ex three days before the split, paid two days after it: written by the next night's job.
        const late = {symbol: 'NVDA', exDate: '2024-06-07', quantity: 100, perShare: 0.1, amount: 10, createdAt: new Date(at('2024-06-13', 0, 5))};
        expect(restateDividend(late, [applied])).toBe(late);
        const early = {...late, quantity: 10, perShare: 1, createdAt: new Date(at('2024-06-08', 0, 5))};
        expect(restateDividend(early, [applied])).toMatchObject({quantity: 100, perShare: 0.1});
    });

    it('leaves a later dividend, another symbol and a row without its figures alone', () => {
        const later = {...row, exDate: '2024-06-11'};
        expect(restateDividend(later, [tenForOne])).toBe(later);
        const other = {...row, symbol: 'AAPL'};
        expect(restateDividend(other, [tenForOne])).toBe(other);
        const bare = {symbol: 'NVDA', exDate: null, quantity: null, perShare: null, amount: 0.4};
        expect(restateDividend(bare, [tenForOne])).toBe(bare);
    });
});

describe('toAppliedSplits', () => {
    it('reads a stored list, and none as none', () => {
        expect(toAppliedSplits(undefined)).toEqual([]);
        expect(toAppliedSplits([{symbol: 'NVDA', exDate: EX, numerator: 10, denominator: 1, before: new Date(splitInstant(EX))}]))
            .toEqual([tenForOne]);
        expect(toAppliedSplits([{symbol: 'NVDA', exDate: EX, numerator: 10, denominator: 1, before: new Date(splitInstant(EX)), appliedAt: new Date(at(EX, 9, 40))}]))
            .toEqual([{...tenForOne, appliedAt: at(EX, 9, 40)}]);
    });

    it('restates a lean row whose time is a Date', () => {
        const row = {symbol: 'NVDA', side: 'buy' as const, quantity: 10, price: 1200, total: 12_000, createdAt: new Date(at('2024-06-07', 10))};
        expect(restateFill(row, [tenForOne])).toMatchObject({quantity: 100, price: 120, createdAt: row.createdAt});
    });
});

describe('describeSplitRun', () => {
    const applied = {accountId: 'aaaaaaaaaaaaaaaaaa111111', symbol: 'NVDA', exDate: EX, numerator: 10, denominator: 1, lateDays: 0};

    it('names the ratio the way people say it', () => {
        expect(splitLabel({numerator: 10, denominator: 1})).toBe('10-for-1');
        expect(splitLabel({numerator: 1, denominator: 8})).toBe('1-for-8');
    });

    it('says what was checked when nothing changed', () => {
        expect(describeSplitRun({checked: 36, unanswered: [], detection: true, applied: [], skipped: []}))
            .toBe('Checked 36 holding(s) · no split to apply');
    });

    it('names the symbols Yahoo did not answer for', () => {
        expect(describeSplitRun({checked: 34, unanswered: ['ABC', 'DEF'], detection: true, applied: [], skipped: []}))
            .toBe('Checked 36 holding(s) (2 not answered: ABC, DEF) · no split to apply');
    });

    it('groups the accounts a split was applied to, and says when it was late', () => {
        const run = {checked: 5, unanswered: [], detection: true, skipped: [], applied: [applied, {...applied, accountId: 'b', lateDays: 3}]};
        expect(describeSplitRun(run)).toBe('Checked 5 holding(s) · NVDA 10-for-1 of 2024-06-10 applied to 2 account(s), 3 session(s) late: snapshots in between were valued before it');
    });

    it('names what it skipped and why', () => {
        const run = {checked: 5, unanswered: [], detection: true, applied: [], skipped: [{accountId: 'aaaaaaaaaaaaaaaaaa222222', symbol: 'NVDA', reason: 'position does not rebuild from its trades'}]};
        expect(describeSplitRun(run)).toBe('Checked 5 holding(s) · no split to apply · 1 skipped: 222222 NVDA (position does not rebuild from its trades)');
    });

    it('names an account whose write kept losing', () => {
        const run = {checked: 5, unanswered: [], detection: true, applied: [], skipped: [], unsettled: [{accountId: 'aaaaaaaaaaaaaaaaaa333333', symbol: 'NVDA'}]};
        expect(describeSplitRun(run)).toBe('Checked 5 holding(s) · no split to apply · 1 not applied, the account changed mid-write (333333 NVDA): tried again next run');
    });

    it('says so when detection is off', () => {
        expect(describeSplitRun({checked: 0, unanswered: [], detection: false, applied: [applied], skipped: []}))
            .toBe('Detection off · NVDA 10-for-1 of 2024-06-10 applied to 1 account(s)');
    });
});
