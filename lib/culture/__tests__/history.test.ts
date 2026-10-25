// The daily run's Wikipedia plan: a brand without the history its attention features need is
// asked for the whole backfill window (listed owners first), every other brand for the lookback.

import {describe, expect, it} from 'vitest';
import {historyWindow, needsHistory, planWikipediaFetch, recentWindow} from '@/lib/culture/history';
import type {CultureBrand} from '@/lib/culture/types';

const brand = (id: string, listed: boolean): CultureBrand =>
    ({id, name: id, category: 'drinks', aliases: [id], owner: listed ? {company: id, ticker: id.toUpperCase(), listing: 'us'} : null, wikipedia: [id]});

const TODAY = '2026-10-25';
const ASOF = '2026-10-24';

describe('needsHistory', () => {
    it('is true without a stored month, or when the first stored month starts after the baseline must', () => {
        // The baseline reads the 180 days before the last 28: from 2026-03-31, so March.
        expect(needsHistory(undefined, ASOF)).toBe(true);
        expect(needsHistory('2026-10', ASOF)).toBe(true);
        expect(needsHistory('2026-04', ASOF)).toBe(true);
        expect(needsHistory('2026-03', ASOF)).toBe(false);
        expect(needsHistory('2020-04', ASOF)).toBe(false);
    });
});

describe('the windows', () => {
    it('asks the lookback for a brand with history, the backfill horizon for one without', () => {
        expect(recentWindow(TODAY, ASOF)).toEqual({from: '2026-10-15', to: ASOF});
        const full = historyWindow(TODAY, ASOF);
        expect(full.to).toBe(ASOF);
        expect(full.from <= '2020-05-01' && full.from >= '2020-04-01').toBe(true);
    });
});

describe('planWikipediaFetch', () => {
    const brands = [brand('aa-private', false), brand('bb-listed', true), brand('cc-listed', true), brand('dd-private', false), brand('ee-listed', true)];

    it('puts every brand in exactly one list, the ones lacking history first among listed owners', () => {
        const firstMonth = new Map([['cc-listed', '2019-01'], ['dd-private', '2019-01']]);
        const plan = planWikipediaFetch(brands, firstMonth, ASOF);
        expect(plan.history).toEqual(['bb-listed', 'ee-listed', 'aa-private']);
        expect(plan.recent).toEqual(['cc-listed', 'dd-private']);
    });

    it('asks only the lookback once every brand has its history', () => {
        const firstMonth = new Map(brands.map((b) => [b.id, '2020-01']));
        expect(planWikipediaFetch(brands, firstMonth, ASOF)).toEqual({history: [], recent: brands.map((b) => b.id)});
    });

    it('keeps the catalog order within each group', () => {
        const plan = planWikipediaFetch([...brands].reverse(), new Map(), ASOF);
        expect(plan.history).toEqual(['ee-listed', 'cc-listed', 'bb-listed', 'dd-private', 'aa-private']);
    });
});
