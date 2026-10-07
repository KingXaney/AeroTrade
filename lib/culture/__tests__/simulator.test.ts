// The culture pickers' simulator: weekly decisions through the live engine over a synthetic
// market, nothing seen ahead of its day, the price-only control blind to attention, fills at
// the next open (the close when a bar has none), income through the one accrual clock, and a
// five-year universe of sixty owners inside the step budget.

import {describe, expect, it} from 'vitest';
import {MIN_PRICE_BARS, THESIS_WEIGHT_THRESHOLD_FOR_TESTS} from './simulator-fixture';
import {attentionReplayer, isWeekStart, simulateCulture, sliceBetween, type CultureSimulationInput} from '@/lib/culture/simulator';
import {addCalendarDays, getEasternWeekKey} from '@/lib/dates';
import type {Bar} from '@/lib/prices/signals';
import {BRANDS, LAUNCH, SESSIONS, barsFor, baseInput, views} from './simulator-fixture';

const stringify = (value: unknown): string => JSON.stringify(value);

describe('simulateCulture — cadence and window', () => {
    const sim = simulateCulture(baseInput());
    const price = sim.variants.find((v) => v.profile === 'price')!;

    it('runs one variant per profile, in the order asked', () => {
        expect(sim.variants.map((v) => v.profile)).toEqual(['price', 'spike', 'quiet']);
    });

    it('decides on the first session of each ET week, the last resultWeeks of them, after the warm-up', () => {
        expect(price.weeks).toBe(40);
        const startIndex = SESSIONS.indexOf(price.points[0].date);
        expect(startIndex).toBeGreaterThanOrEqual(260);
        expect(isWeekStart(SESSIONS, startIndex + 1)).toBe(true);
        for (const variant of sim.variants) {
            for (const trade of variant.trades) {
                const index = SESSIONS.indexOf(trade.date);
                expect(isWeekStart(SESSIONS, index), `${variant.profile} ${trade.date}`).toBe(true);
                expect(index).toBeGreaterThan(startIndex);
            }
        }
    });

    it('marks every session to market from the day before the first decision to the end', () => {
        const startIndex = SESSIONS.indexOf(price.points[0].date);
        expect(price.points.map((p) => p.date)).toEqual(SESSIONS.slice(startIndex));
        expect(price.points[0].value).toBe(100_000);
        expect(sim.from).toBe(price.from);
        expect(sim.to).toBe(SESSIONS[SESSIONS.length - 1]);
        expect(sim.benchmark.map((p) => p.date)).toEqual(price.points.map((p) => p.date));
        expect(price.stats.benchmarkReturnPct).not.toBeNull();
    });

    it('trades, and never a name with fewer bars than the minimum', () => {
        expect(price.trades.length).toBeGreaterThan(0);
        for (const variant of sim.variants) {
            expect(variant.trades.some((t) => t.symbol === 'CCC'), variant.profile).toBe(false);
        }
        expect(100).toBeLessThan(MIN_PRICE_BARS);
    });

    it('reads every feed the stored series carry: price, pageviews and the replayed entities', () => {
        expect(sim.feeds).toContain('price');
        expect(sim.feeds).toContain('wikipedia');
        expect(sim.feeds).toContain('mentions');
    });

    it('is deterministic', () => {
        expect(stringify(simulateCulture(baseInput()))).toBe(stringify(sim));
    });
});

describe('simulateCulture — what each variant sees', () => {
    it('the price-only control ignores attention; the attention pickers do not', () => {
        const withSurge = simulateCulture(baseInput());
        const flat = baseInput();
        flat.attention = new Map([...flat.attention].map(([id]) => [id, views(() => 100)]));
        const withoutSurge = simulateCulture(flat);
        const pick = (sim: ReturnType<typeof simulateCulture>, profile: string) => sim.variants.find((v) => v.profile === profile)!;
        expect(stringify(pick(withoutSurge, 'price').trades)).toBe(stringify(pick(withSurge, 'price').trades));
        expect(stringify(pick(withoutSurge, 'price').points)).toBe(stringify(pick(withSurge, 'price').points));
        const spikeSame = stringify(pick(withoutSurge, 'spike').trades) === stringify(pick(withSurge, 'spike').trades)
            && stringify(pick(withoutSurge, 'spike').points) === stringify(pick(withSurge, 'spike').points);
        expect(spikeSame).toBe(false);
    });

    it('sees nothing after the day it decides on', () => {
        const base = simulateCulture(baseInput());
        const price = base.variants.find((v) => v.profile === 'price')!;
        const cut = price.points[60].date;
        const mutated = baseInput();
        const bump = (bars: readonly Bar[]): Bar[] => bars.map((bar) => (bar.date > cut ? {...bar, close: bar.close * 3, open: (bar.open ?? bar.close) * 3, high: (bar.high ?? bar.close) * 3, low: (bar.low ?? bar.close) * 3} : bar));
        mutated.bars = new Map([...mutated.bars].map(([symbol, bars]) => [symbol, bump(bars)]));
        mutated.attention = new Map([...mutated.attention].map(([id, series]) => [id, series.map((p) => (p.date > cut ? {...p, value: p.value * 5} : p))]));
        const later = simulateCulture(mutated);
        for (const variant of base.variants) {
            const twin = later.variants.find((v) => v.profile === variant.profile)!;
            expect(stringify(twin.points.filter((p) => p.date <= cut)), variant.profile).toBe(stringify(variant.points.filter((p) => p.date <= cut)));
            expect(stringify(twin.trades.filter((t) => t.date <= cut)), variant.profile).toBe(stringify(variant.trades.filter((t) => t.date <= cut)));
        }
        // And the mutation reached the rest of the window.
        expect(stringify(later.variants[0].points)).not.toBe(stringify(base.variants[0].points));
    });

    it('fills at the next open, or at the close when the bar has none, and counts those', () => {
        const input = baseInput();
        input.bars.set('BBB', barsFor(SESSIONS, 80, 0.0009).map((bar) => ({...bar, open: undefined})));
        const sim = simulateCulture(input);
        for (const variant of sim.variants) {
            const bbb = variant.trades.filter((t) => t.symbol === 'BBB');
            expect(bbb.length, variant.profile).toBeGreaterThan(0);
            expect(bbb.every((t) => t.fill === 'close')).toBe(true);
            expect(variant.trades.filter((t) => t.symbol !== 'BBB').every((t) => t.fill === 'open')).toBe(true);
            expect(variant.closeFills).toBe(bbb.length);
            for (const trade of bbb) {
                expect(trade.price).toBe(input.bars.get('BBB')!.find((bar) => bar.date === trade.date)!.close);
            }
        }
    });

    it('lets a brand join its owner only from the day it changed hands', () => {
        const input = baseInput();
        const since = SESSIONS[700];
        input.brands = BRANDS.map((brand) => (brand.id === 'bbb' ? {...brand, owner: {...brand.owner!, since}} : brand));
        const sim = simulateCulture(input);
        for (const variant of sim.variants) {
            expect(variant.trades.some((t) => t.symbol === 'BBB' && t.date <= since), variant.profile).toBe(false);
            expect(variant.trades.some((t) => t.symbol === 'BBB' && t.date > since), variant.profile).toBe(true);
        }
    });

    it('returns an empty record when the history is shorter than the warm-up', () => {
        const input = baseInput();
        input.bars = new Map([...input.bars].map(([symbol, bars]) => [symbol, bars.slice(0, 100)]));
        const sim = simulateCulture(input);
        for (const variant of sim.variants) {
            expect(variant.weeks).toBe(0);
            expect(variant.points).toHaveLength(1);
            expect(variant.trades).toEqual([]);
        }
    });
});

describe('attentionReplayer', () => {
    const start = addCalendarDays(SESSIONS[0], -420);
    const end = SESSIONS[SESSIONS.length - 1];
    const surge = addCalendarDays(start, 300);

    it('has no entity before the first surprise, one after it, decaying between reads', () => {
        const replay = attentionReplayer(BRANDS[0], views((date) => (date >= surge ? 400 : 100)));
        expect(replay.stateAt(addCalendarDays(start, 200))).toBeNull();
        const soon = replay.stateAt(addCalendarDays(surge, 10));
        expect(soon).not.toBeNull();
        expect(soon!.weightSlow).toBeGreaterThan(0);
        expect(soon!.key).toBe('aaa');
        expect(soon!.ticker).toBe('AAA');
        expect(soon!.sentimentSlow).toBe(0);
        // Once the baseline has caught up there is no surprise left to fold, so the weight only decays.
        const later = replay.stateAt(addCalendarDays(surge, 200))!;
        const latest = replay.stateAt(addCalendarDays(surge, 260))!;
        expect(latest.weightSlow).toBeLessThan(later.weightSlow);
        expect(end > addCalendarDays(surge, 260)).toBe(true);
    });

    it('never folds a flat series, and starts a thesis only past the threshold', () => {
        expect(attentionReplayer(BRANDS[0], views(() => 100)).stateAt(end)).toBeNull();
        const strong = attentionReplayer(BRANDS[0], views((date) => (date >= surge ? 100_000 : 100)));
        const state = strong.stateAt(addCalendarDays(surge, 20))!;
        expect(state.weightSlow).toBeGreaterThanOrEqual(THESIS_WEIGHT_THRESHOLD_FOR_TESTS);
        expect(state.thesisSince).not.toBeNull();
    });
});

describe('the helpers', () => {
    it('slices a dated series by binary search, inclusive', () => {
        const items = ['2026-01-01', '2026-01-03', '2026-01-05'].map((date) => ({date}));
        const dates = items.map((i) => i.date);
        expect(sliceBetween(items, dates, '2026-01-02', '2026-01-05').map((i) => i.date)).toEqual(['2026-01-03', '2026-01-05']);
        expect(sliceBetween(items, dates, '2026-01-01', '2026-01-01').map((i) => i.date)).toEqual(['2026-01-01']);
        expect(sliceBetween(items, dates, '2026-02-01', '2026-02-09')).toEqual([]);
    });

    it('names a week start by the ET week key moving', () => {
        const calendar = ['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06'];
        expect(calendar.map((_, i) => isWeekStart(calendar, i))).toEqual([false, false, true, false]);
        expect(getEasternWeekKey('2026-10-05')).toBe('2026-10-05');
    });
});

describe('simulateCulture — the step budget', () => {
    it('simulates sixty owners over five years of weekly decisions in well under a step', () => {
        const count = 60;
        const sessions = SESSIONS;
        const brands = Array.from({length: count}, (_, i) => ({...BRANDS[0], id: `b${i}`, name: `B${i}`, owner: {company: `T${i}`, ticker: `T${i}`, listing: 'us' as const}, category: (['drinks', 'apparel', 'apps'] as const)[i % 3]}));
        const input: CultureSimulationInput = {
            tickers: brands.map((b) => ({symbol: b.owner!.ticker, listing: 'us', company: b.owner!.company, brands: [{id: b.id, name: b.name, category: b.category}]})),
            bars: new Map([...brands.map((b, i) => [b.owner!.ticker, barsFor(sessions, 20 + i, 0.0001 + (i % 7) * 0.0002)] as const), ['SPY', barsFor(sessions, 400, 0.0004)]]),
            attention: new Map(brands.map((b, i) => [b.id, views((date) => (date >= sessions[200 + (i * 37) % 500] ? 100 + (i % 5) * 60 : 100))])),
            brands,
            profiles: ['price', 'spike', 'quiet'],
            launchDate: LAUNCH,
            startingBalance: 100_000,
        };
        const started = Date.now();
        const sim = simulateCulture(input);
        const elapsed = Date.now() - started;
        expect(sim.variants[0].weeks).toBeGreaterThan(100);
        expect(elapsed).toBeLessThan(40_000);
    }, 60_000);
});
