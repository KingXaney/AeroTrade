import {describe, expect, it} from 'vitest';
import {CULTURE_RAILS, type CultureFeed} from '@/lib/culture/config';
import {buildCultureItems} from '@/lib/culture/decisions';
import {decideWeek, firstWeekTrades} from '@/lib/culture/engine';
import type {CultureScoringInput} from '@/lib/culture/scoring';
import type {HeldPosition} from '@/lib/navigator/allocator';

const FEEDS: CultureFeed[] = ['price', 'wikipedia', 'mentions'];

const input = (symbol: string, anomaly: number, extra: Partial<CultureScoringInput> = {}): CultureScoringInput => ({
    symbol,
    brands: [{id: symbol.toLowerCase(), name: symbol}],
    attentionAnomaly: anomaly,
    attentionTrend: anomaly,
    attentionPersistence: null,
    quietAttention: null,
    categoryShare: null,
    attentionSinceReport: null,
    attentionSlow: 1 + anomaly,
    sentimentSlow: 0,
    appRank: null,
    hasThesis: anomaly > 1,
    signals: {r63: 0.05 + anomaly / 10, r126: 0.1 + anomaly / 10, r252: 0.2 + anomaly / 10, vol63: 0.2, ma200dist: 0.1},
    barsCount: 300,
    quoted: true,
    brandsCovered: 1,
    ...extra,
});

const position = (symbol: string, patch: Partial<HeldPosition> = {}): HeldPosition =>
    ({symbol, quantity: 0, avgCost: 0, price: 100, heldTradingDays: null, thesisBroken: false, score: null, ...patch});

const UNIVERSE = ['AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'FFF'].map((symbol, i) => input(symbol, 2 - i * 0.6));

describe('decideWeek', () => {
    it('scores the universe, targets only the targetable names under the culture rails, and plans orders', () => {
        const book = {totalValue: 100_000, cash: 100_000, positions: UNIVERSE.map((u) => position(u.symbol))};
        const week = decideWeek({inputs: UNIVERSE, feeds: FEEDS, profile: 'spike', book, targetable: new Set(['AAA', 'BBB', 'CCC', 'DDD', 'EEE']), maxTrades: firstWeekTrades(book.positions)});
        expect(week.scored).toHaveLength(6);
        expect(week.targets.length).toBeGreaterThan(0);
        expect(week.targets.length).toBeLessThanOrEqual(CULTURE_RAILS.maxPositions);
        expect(week.targets.every((t) => t.symbol !== 'FFF')).toBe(true);
        expect(week.targets.every((t) => t.weight <= CULTURE_RAILS.maxPositionWeight + 1e-9)).toBe(true);
        expect(week.orders.every((o) => o.side === 'buy')).toBe(true);
        expect(week.orders.map((o) => o.symbol)).toEqual(week.targets.map((t) => t.symbol));
        const spent = week.orders.reduce((sum, o) => sum + o.quantity * 100, 0);
        expect(spent).toBeLessThanOrEqual(100_000 * (1 - CULTURE_RAILS.minCashWeight) + 1e-6);
    });

    it('is deterministic, and scores a held name outside the targetable set for its exit only', () => {
        const held = position('FFF', {quantity: 100, avgCost: 100, price: 60, heldTradingDays: 40});
        const book = {totalValue: 100_000, cash: 94_000, positions: [...UNIVERSE.slice(0, 5).map((u) => position(u.symbol)), held]};
        const args = {inputs: UNIVERSE, feeds: FEEDS, profile: 'quiet' as const, book, targetable: new Set(['AAA', 'BBB'])};
        const first = decideWeek(args);
        expect(decideWeek(args)).toEqual(first);
        expect(first.targets.map((t) => t.symbol).sort()).toEqual(['AAA', 'BBB']);
        const exit = first.orders.find((o) => o.symbol === 'FFF');
        expect(exit?.side).toBe('sell');
        expect(exit?.reason).toMatch(/hard stop|below exit threshold/);
    });

    it('lifts the trade cap on an empty book only', () => {
        expect(firstWeekTrades([position('AAA')])).toBe(CULTURE_RAILS.maxPositions);
        expect(firstWeekTrades([position('AAA', {quantity: 1})])).toBeUndefined();
        expect(firstWeekTrades([])).toBe(CULTURE_RAILS.maxPositions);
    });
});

describe('buildCultureItems', () => {
    it('lists the orders with their outcomes, then the kept positions, each with its brands', () => {
        const book = {totalValue: 100_000, cash: 50_000, positions: [position('AAA', {quantity: 100, avgCost: 90, price: 100}), position('ZZZ', {quantity: 10, avgCost: 10, price: 20, score: 0.2}), position('BBB')]};
        const week = decideWeek({inputs: UNIVERSE, feeds: FEEDS, profile: 'spike', book, targetable: new Set(['AAA', 'BBB'])});
        const items = buildCultureItems({
            orders: week.orders,
            outcomes: week.orders.map((o, i) => (i === 0 ? {success: true, price: 101} : {success: false, message: 'no price'})),
            positions: book.positions,
            totalValue: book.totalValue,
            targets: week.targets,
            scored: week.scored,
            brandsBySymbol: new Map([['AAA', [{id: 'aaa', name: 'AAA'}]], ['BBB', [{id: 'bbb', name: 'BBB'}]]]),
        });
        const kept = book.positions.filter((p) => p.quantity > 0 && !week.orders.some((o) => o.symbol === p.symbol));
        expect(items.length).toBe(week.orders.length + kept.length);
        expect(kept.some((p) => p.symbol === 'ZZZ')).toBe(true);
        expect(items[0]).toMatchObject({executed: true, executionPrice: 101});
        if (week.orders.length > 1) expect(items[1]).toMatchObject({executed: false, error: 'no price'});
        const hold = items.find((i) => i.symbol === 'ZZZ');
        expect(hold).toMatchObject({action: 'hold', executed: false, currentWeight: 200 / 100_000});
        expect(hold?.brands).toEqual([]);
        const aaa = items.find((i) => i.symbol === 'AAA');
        expect(aaa?.brands).toEqual([{id: 'aaa', name: 'AAA'}]);
        expect(aaa?.reasons[0]).toMatch(/^(rebalance|exit|enter|holding|picker)/);
        for (const item of items) expect(item.reasons.length).toBeLessThanOrEqual(6);
    });
});
