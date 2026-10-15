// Enrolling with a culture picker, the pure parts: the pickers that may be enrolled with, the
// account's name, a picker's decision read back as targets, the status the card shows, the
// bootstrap's summary — and the book-level decision an enrolled account takes from the picker's
// scores and targets.

import {describe, expect, it} from 'vitest';
import {CULTURE_RAILS, LIVE_PROFILES, type CultureFeed} from '@/lib/culture/config';
import type {CultureDecisionItem} from '@/lib/culture/decisions';
import {decideForBook, decideWeek, firstWeekTrades} from '@/lib/culture/engine';
import {describeFollowRun, followAccountName, FollowProfileSchema, followStatusView, isFollowProfile, LIVE_FOLLOW_PROFILES, scoredFromItems, targetsFromDecisionItems} from '@/lib/culture/follow';
import type {CultureScoringInput} from '@/lib/culture/scoring';
import type {HeldPosition} from '@/lib/navigator/allocator';

const item = (symbol: string, targetWeight: number, action: CultureDecisionItem['action'] = 'buy', score = 0.5): CultureDecisionItem =>
    ({symbol, action, targetWeight, currentWeight: 0, score, reasons: [`picker Spike`, `enter: score ${score}`], brands: [{id: symbol.toLowerCase(), name: symbol}], executed: false});

const FEEDS: CultureFeed[] = ['price', 'wikipedia', 'mentions'];
const input = (symbol: string, anomaly: number): CultureScoringInput => ({
    symbol, brands: [{id: symbol.toLowerCase(), name: symbol}], attentionAnomaly: anomaly, attentionTrend: anomaly, attentionPersistence: null,
    quietAttention: null, categoryShare: null, attentionSinceReport: null, attentionSlow: 1 + anomaly, sentimentSlow: 0, appRank: null,
    hasThesis: anomaly > 1, signals: {r63: 0.05 + anomaly / 10, r126: 0.1 + anomaly / 10, r252: 0.2 + anomaly / 10, vol63: 0.2, ma200dist: 0.1},
    barsCount: 300, quoted: true, brandsCovered: 1,
});
const position = (symbol: string, patch: Partial<HeldPosition> = {}): HeldPosition =>
    ({symbol, quantity: 0, avgCost: 0, price: 100, heldTradingDays: null, thesisBroken: false, score: null, ...patch});
const UNIVERSE = ['AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'FFF'].map((symbol, i) => input(symbol, 2 - i * 0.6));
const TARGETABLE = new Set(['AAA', 'BBB', 'CCC', 'DDD', 'EEE']);

describe('enrolling with a picker', () => {
    it('allows exactly the live pickers, and names the account after the picker, never as the picker\'s own', () => {
        expect([...FollowProfileSchema.options].sort()).toEqual([...LIVE_PROFILES].sort());
        expect(LIVE_FOLLOW_PROFILES).toEqual(LIVE_PROFILES);
        for (const junk of ['price', 'Spike', '', 7, null, undefined, 'constructor']) expect(isFollowProfile(junk), String(junk)).toBe(false);
        expect(followAccountName('spike')).toBe('Culture · Spike');
        expect(followAccountName('quiet')).toBe('Culture · Quiet');
        expect(followAccountName('spike')).not.toMatch(/Culture Brain/);
        expect(followAccountName('spike').length).toBeLessThanOrEqual(40);
    });

    it('reads a picker\'s decision back as the week\'s targets: every weight above zero, once, with its score and reasons', () => {
        const items = [item('AAA', 0.15), item('BBB', 0.10, 'hold', 0.3), item('CCC', 0, 'sell', -0.2), item('AAA', 0.15, 'hold'), item('DDD', 0.05, 'sell', 0.2)];
        const targets = targetsFromDecisionItems(items);
        expect(targets.map((t) => [t.symbol, t.weight, t.score])).toEqual([['AAA', 0.15, 0.5], ['BBB', 0.10, 0.3], ['DDD', 0.05, 0.2]]);
        expect(targets[0].reasons).toEqual(items[0].reasons);
        expect(targets[0].reasons).not.toBe(items[0].reasons);
        expect(scoredFromItems(items).map((s) => [s.symbol, s.score, s.eligible])).toEqual([['AAA', 0.5, true], ['BBB', 0.3, true], ['CCC', -0.2, true], ['AAA', 0.5, true], ['DDD', 0.2, true]]);
        expect(targetsFromDecisionItems([])).toEqual([]);
    });

    it('shows an enrolment as the card reads it, and nothing before one', () => {
        expect(followStatusView(null)).toEqual({enrolled: false});
        const at = new Date('2026-10-14T14:00:00Z');
        expect(followStatusView({userId: 'u', profile: 'spike', accountId: 'a1', status: 'paused', enrolledAt: at, lastRunWeek: '2026-10-12', lastError: null}))
            .toEqual({enrolled: true, status: 'paused', accountId: 'a1', enrolledAt: at.getTime(), lastRunWeek: '2026-10-12'});
        expect(followStatusView({userId: 'u', profile: 'quiet', accountId: 'a2', status: 'active', enrolledAt: at, lastRunWeek: null, lastError: 'x'}))
            .toMatchObject({enrolled: true, status: 'active', lastError: 'x'});
    });

    it('describes a bootstrap run in a line', () => {
        expect(describeFollowRun({profile: 'spike', kind: 'executed', orders: 4, filled: 3})).toBe('Culture enrolment — Spike: 3/4 order(s) filled');
        expect(describeFollowRun({profile: 'quiet', kind: 'preview', orders: 2, filled: 0, note: 'market closed'})).toBe('Culture enrolment — Quiet: 2 order(s) planned (preview) — market closed');
        expect(describeFollowRun({profile: 'spike', kind: 'skipped', orders: 0, filled: 0})).toMatch(/already ran this week/);
        expect(describeFollowRun({profile: 'spike', kind: 'no-decision', orders: 0, filled: 0})).toMatch(/has not run yet/);
        expect(describeFollowRun({profile: 'spike', kind: 'not-enrolled', orders: 0, filled: 0})).toMatch(/no active enrolment/);
    });
});

describe('decideForBook', () => {
    const book = {totalValue: 100_000, cash: 100_000, positions: UNIVERSE.map((u) => position(u.symbol))};
    const week = decideWeek({inputs: UNIVERSE, feeds: FEEDS, profile: 'spike', book, targetable: TARGETABLE, maxTrades: firstWeekTrades(book.positions)});

    it('gives the picker\'s own orders for the picker\'s own book', () => {
        expect(decideForBook({scored: week.scored, targets: week.targets, book, maxTrades: firstWeekTrades(book.positions)})).toEqual(week.orders);
    });

    it('deploys an empty enrolled book into the same targets, sized to its own cash', () => {
        const small = {totalValue: 20_000, cash: 20_000, positions: UNIVERSE.map((u) => position(u.symbol))};
        const orders = decideForBook({scored: week.scored, targets: week.targets, book: small, maxTrades: firstWeekTrades(small.positions)});
        expect(orders.every((o) => o.side === 'buy')).toBe(true);
        expect(orders.map((o) => o.symbol)).toEqual(week.orders.map((o) => o.symbol));
        for (const order of orders) {
            const own = week.orders.find((o) => o.symbol === order.symbol)!;
            expect(order.quantity).toBeLessThan(own.quantity);
        }
        const spent = orders.reduce((sum, o) => sum + o.quantity * 100, 0);
        expect(spent).toBeLessThanOrEqual(20_000 * (1 - CULTURE_RAILS.minCashWeight) + 1e-6);
    });

    it('keeps a hand-bought holding the picker does not target, and exits it once its score falls below the threshold', () => {
        const kept = position('FFF', {quantity: 50, avgCost: 100, price: 100, heldTradingDays: 40});
        const enrolled = {totalValue: 100_000, cash: 95_000, positions: [...UNIVERSE.slice(0, 5).map((u) => position(u.symbol)), kept]};
        const healthy = decideForBook({scored: week.scored.map((s) => (s.symbol === 'FFF' ? {...s, score: 0.05} : s)), targets: week.targets, book: enrolled});
        expect(healthy.find((o) => o.symbol === 'FFF')).toBeUndefined();
        const falling = decideForBook({scored: week.scored.map((s) => (s.symbol === 'FFF' ? {...s, score: -0.1} : s)), targets: week.targets, book: enrolled});
        expect(falling.find((o) => o.symbol === 'FFF')).toMatchObject({side: 'sell', quantity: 50});
    });

    it('differs by book alone: the same targets, two books, two order lists', () => {
        const other = {totalValue: 100_000, cash: 40_000, positions: [...UNIVERSE.slice(1).map((u) => position(u.symbol)), position('AAA', {quantity: 600, avgCost: 100, price: 100, heldTradingDays: 60})]};
        const orders = decideForBook({scored: week.scored, targets: week.targets, book: other});
        expect(orders).not.toEqual(week.orders);
        expect(orders.some((o) => o.symbol === 'AAA' && o.side === 'sell')).toBe(true);   // 60% held against a 15% cap, past the minimum hold
    });
});
