// The whole pure chain the weekly job runs, on the harness's own fixture: two quoted owners,
// one with a brand whose pageviews tripled over the last four weeks, three hundred sessions of
// bars, an empty book. Both live pickers must plan a buy of the surging owner.

import {describe, expect, it} from 'vitest';
import {brandById} from '@/lib/culture/catalog';
import {LIVE_PROFILES} from '@/lib/culture/config';
import {decideWeek, firstWeekTrades} from '@/lib/culture/engine';
import {toScoringInputs, type BrandSeriesInput} from '@/lib/culture/inputs';
import {cultureTickers} from '@/lib/culture/universe';
import {addCalendarDays} from '@/lib/dates';
import type {AttentionPoint, CultureEntitySummary} from '@/lib/culture/types';
import type {HeldPosition} from '@/lib/navigator/allocator';
import type {Bar} from '@/lib/prices/signals';

const AS_OF = '2026-10-06';

const sessions = (count: number): string[] => {
    const out: string[] = [];
    for (let d = AS_OF; out.length < count; d = addCalendarDays(d, -1)) {
        const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
        if (dow !== 0 && dow !== 6) out.unshift(d);
    }
    return out;
};

const bars = (base: number): Bar[] => sessions(300).map((date, i) => {
    const close = base * (1 + i / 600);
    return {date, close, open: close * 0.995, high: close * 1.01, low: close * 0.99};
});

const views = (valueAt: (back: number) => number): AttentionPoint[] =>
    Array.from({length: 420}, (_, i) => ({date: addCalendarDays(AS_OF, -(419 - i)), value: valueAt(419 - i)}));

const entity = (key: string, weightSlow: number, sentimentSlow: number): CultureEntitySummary =>
    ({key, displayName: key, category: 'drinks', ticker: null, listing: null, weightFast: weightSlow, weightSlow, sentimentFast: sentimentSlow, sentimentSlow, thesisSince: null, lastSeenAt: 1});

describe('a week on the harness fixture', () => {
    const tickers = cultureTickers().filter((t) => t.symbol === 'CELH' || t.symbol === 'PEP');
    const brands = new Map<string, BrandSeriesInput>();
    for (const ticker of tickers) {
        for (const b of ticker.brands) {
            const brand = brandById(b.id)!;
            brands.set(b.id, {
                brand,
                wikipedia: b.id === 'celsius' ? views((back) => (back < 28 ? 299 : 99)) : b.id === 'pepsi' ? views(() => 500) : b.id === 'poppi' ? views(() => 50) : [],
                appstore: [],
                news: [],
                entity: b.id === 'celsius' ? entity('celsius', 1.3, 0.46) : b.id === 'poppi' ? entity('poppi', 0.24, -0.4) : null,
                reportDate: null,
            });
        }
    }
    const {inputs, feeds} = toScoringInputs({tickers, quoted: new Set(['CELH', 'PEP']), bars: new Map([['CELH', bars(30)], ['PEP', bars(140)]]), brands, asOf: AS_OF});

    it('measures both owners and finds the surge', () => {
        expect(feeds).toEqual(['price', 'wikipedia', 'mentions']);
        const celh = inputs.find((i) => i.symbol === 'CELH')!;
        const pep = inputs.find((i) => i.symbol === 'PEP')!;
        expect(celh.barsCount).toBe(300);
        expect(celh.quoted).toBe(true);
        expect(celh.brandsCovered).toBe(1);
        expect(celh.attentionAnomaly).toBeCloseTo(Math.log(3), 6);
        expect(pep.brandsCovered).toBe(2);
        expect(pep.attentionAnomaly).toBeCloseTo(0, 6);
    });

    it.each(LIVE_PROFILES)('%s buys the surging owner into an empty book', (profile) => {
        const positions: HeldPosition[] = [
            {symbol: 'CELH', quantity: 0, avgCost: 0, price: 40, heldTradingDays: null, thesisBroken: false, score: null},
            {symbol: 'PEP', quantity: 0, avgCost: 0, price: 150, heldTradingDays: null, thesisBroken: false, score: null},
        ];
        const week = decideWeek({inputs, feeds, profile, book: {totalValue: 100_000, cash: 100_000, positions}, targetable: new Set(['CELH', 'PEP']), maxTrades: firstWeekTrades(positions)});
        const celh = week.scored.find((s) => s.symbol === 'CELH')!;
        expect(celh.eligible, celh.reasons.join(' | ')).toBe(true);
        expect(celh.score, celh.reasons.join(' | ')).toBeGreaterThan(0.15);
        expect(week.targets.map((t) => t.symbol)).toContain('CELH');
        expect(week.orders.some((o) => o.symbol === 'CELH' && o.side === 'buy' && o.quantity > 0)).toBe(true);
    });
});
