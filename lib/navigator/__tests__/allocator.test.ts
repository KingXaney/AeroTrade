import {describe, expect, it} from "vitest";
import {
    buildTargets,
    diffToOrders,
    type HeldPosition,
    type TargetWeight,
} from "@/lib/navigator/allocator";
import {
    MAX_POSITIONS,
    MAX_TRADES_PER_WEEK,
} from "@/lib/navigator/config";

const scoredItem = (symbol: string, score: number, eligible = true) =>
    ({symbol, score, eligible, reasons: [`reason-${symbol}`]});

const position = (overrides: Partial<HeldPosition> & {symbol: string}): HeldPosition => ({
    quantity: 0,
    avgCost: 0,
    price: null,
    heldTradingDays: null,
    thesisBroken: false,
    score: null,
    ...overrides,
});

const targetOf = (symbol: string, weight: number, score = 0.30): TargetWeight =>
    ({symbol, weight, score, reasons: []});

describe('buildTargets', () => {
    it('keeps only eligible symbols strictly above the entry threshold, sorted by score desc', () => {
        const targets = buildTargets([
            scoredItem('DDD', 0.16),
            scoredItem('AAA', 0.50),
            scoredItem('BBB', 0.15),        // exactly at threshold — excluded (strict >)
            scoredItem('CCC', 0.40, false), // ineligible despite high score
        ]);
        expect(targets.map((t) => t.symbol)).toEqual(['AAA', 'DDD']);
        // Score and reasons pass through untouched.
        expect(targets[0].score).toBe(0.50);
        expect(targets[0].reasons).toEqual(['reason-AAA']);
    });

    it('caps the book at MAX_POSITIONS, dropping the lowest scores', () => {
        // 9 eligible symbols, scores 0.20 .. 0.60 — one more than the cap.
        const scored = Array.from({length: MAX_POSITIONS + 1}, (_, i) =>
            scoredItem(`S${i}`, 0.20 + i * 0.05));
        const targets = buildTargets(scored);
        expect(targets).toHaveLength(MAX_POSITIONS);
        expect(targets[0].symbol).toBe(`S${MAX_POSITIONS}`); // highest score first
        expect(targets.map((t) => t.symbol)).not.toContain('S0'); // lowest dropped
    });

    it('rescales proportional weights so the sum lands on 1 - MIN_CASH_WEIGHT when it would exceed it', () => {
        // Six symbols, scores sum to 2.0 → proportional weights [.2 .2 .1 .1 .2 .2]
        // sum to 1.0 > 0.9 → uniformly rescaled by 0.9, ratios preserved.
        const targets = buildTargets([
            scoredItem('A', 0.4), scoredItem('B', 0.4), scoredItem('C', 0.2),
            scoredItem('D', 0.2), scoredItem('E', 0.4), scoredItem('F', 0.4),
        ]);
        const bySymbol = new Map(targets.map((t) => [t.symbol, t.weight]));
        expect(bySymbol.get('A')).toBeCloseTo(0.18, 10);
        expect(bySymbol.get('C')).toBeCloseTo(0.09, 10);
        const sum = targets.reduce((acc, t) => acc + t.weight, 0);
        expect(sum).toBeCloseTo(0.9, 10);
    });

    it('clamps a single mega-score to MAX_POSITION_WEIGHT without rescaling', () => {
        const targets = buildTargets([scoredItem('MEGA', 5.0)]);
        expect(targets).toHaveLength(1);
        expect(targets[0].weight).toBeCloseTo(0.20, 10); // proportional 1.0 → clamped
    });

    it('leaves clamped weights unscaled when their sum stays under the investable budget', () => {
        // Proportional [0.6, 0.4] → both clamped to 0.2; sum 0.4 < 0.9 → no rescale.
        const targets = buildTargets([scoredItem('X', 0.9), scoredItem('Y', 0.6)]);
        expect(targets.map((t) => t.weight)).toEqual([0.20, 0.20]);
    });
});

describe('diffToOrders — exit triggers', () => {
    it('full-exits an untargeted holding whose score fell below the exit threshold', () => {
        const orders = diffToOrders({
            totalValue: 100_000,
            cash: 10_000,
            positions: [position({symbol: 'AAA', quantity: 100, avgCost: 100, price: 100, heldTradingDays: 100, score: -0.10})],
            targets: [],
        });
        expect(orders).toHaveLength(1);
        expect(orders[0]).toMatchObject({symbol: 'AAA', side: 'sell', quantity: 100});
        expect(orders[0].reason).toContain('exit: score -0.10');
    });

    it('full-exits on a broken thesis', () => {
        const orders = diffToOrders({
            totalValue: 100_000,
            cash: 10_000,
            positions: [position({symbol: 'BBB', quantity: 50, avgCost: 10, price: 12, heldTradingDays: 100, thesisBroken: true})],
            targets: [],
        });
        expect(orders).toHaveLength(1);
        expect(orders[0]).toMatchObject({symbol: 'BBB', side: 'sell', quantity: 50, reason: 'exit: thesis broken'});
    });

    it('full-exits on a hard-stop drawdown vs cost', () => {
        const orders = diffToOrders({
            totalValue: 100_000,
            cash: 10_000,
            positions: [position({symbol: 'CCC', quantity: 40, avgCost: 100, price: 70, heldTradingDays: 100})],
            targets: [],
        });
        expect(orders).toHaveLength(1);
        expect(orders[0]).toMatchObject({symbol: 'CCC', side: 'sell', quantity: 40});
        expect(orders[0].reason).toContain('hard stop');
        expect(orders[0].reason).toContain('-30%');
    });

    it('does not trigger at exactly the hard-stop or exit-score boundaries', () => {
        const orders = diffToOrders({
            totalValue: 100_000,
            cash: 10_000,
            positions: [
                // Exactly -25% — strict < means no trigger.
                position({symbol: 'DDD', quantity: 10, avgCost: 100, price: 75, heldTradingDays: 100}),
                // Score exactly 0 — strict < means no trigger.
                position({symbol: 'EEE', quantity: 10, avgCost: 100, price: 100, heldTradingDays: 100, score: 0}),
            ],
            targets: [],
        });
        expect(orders).toEqual([]);
    });
});

describe('diffToOrders — hysteresis and min-hold', () => {
    it('keeps a healthy untargeted holding with no order (no swap churn)', () => {
        const orders = diffToOrders({
            totalValue: 100_000,
            cash: 10_000,
            positions: [position({symbol: 'AAA', quantity: 100, avgCost: 100, price: 95, heldTradingDays: 100, score: 0.05})],
            targets: [targetOf('ZZZ', 0.15)], // AAA not targeted; ZZZ has no price row → also no order
        });
        expect(orders).toEqual([]);
    });

    it('keeps a young untargeted holding without triggers (min-hold + hysteresis)', () => {
        const orders = diffToOrders({
            totalValue: 100_000,
            cash: 10_000,
            positions: [position({symbol: 'EEE', quantity: 10, avgCost: 100, price: 100, heldTradingDays: 3, score: 0.2})],
            targets: [],
        });
        expect(orders).toEqual([]);
    });

    it('blocks a trim sell inside the minimum holding period', () => {
        const orders = diffToOrders({
            totalValue: 100_000,
            cash: 10_000,
            // Held 0.20 weight, targeted 0.10 → -10k drift, but only 5 trading days held.
            positions: [position({symbol: 'FFF', quantity: 200, avgCost: 50, price: 100, heldTradingDays: 5, score: 0.5})],
            targets: [targetOf('FFF', 0.10)],
        });
        expect(orders).toEqual([]);
    });

    it('allows the same trim once the minimum hold is satisfied', () => {
        const orders = diffToOrders({
            totalValue: 100_000,
            cash: 10_000,
            positions: [position({symbol: 'FFF', quantity: 200, avgCost: 50, price: 100, heldTradingDays: 30, score: 0.5})],
            targets: [targetOf('FFF', 0.10)],
        });
        expect(orders).toHaveLength(1);
        expect(orders[0]).toMatchObject({symbol: 'FFF', side: 'sell', quantity: 100}); // floor(10_000 / 100)
        expect(orders[0].reason).toContain('rebalance');
    });

    it('treats unknown holding age (null) as sellable', () => {
        const orders = diffToOrders({
            totalValue: 100_000,
            cash: 10_000,
            positions: [position({symbol: 'FFF', quantity: 200, avgCost: 50, price: 100, heldTradingDays: null, score: 0.5})],
            targets: [targetOf('FFF', 0.10)],
        });
        expect(orders).toHaveLength(1);
        expect(orders[0]).toMatchObject({symbol: 'FFF', side: 'sell', quantity: 100});
    });

    it('lets exit triggers override the minimum holding period', () => {
        const orders = diffToOrders({
            totalValue: 100_000,
            cash: 10_000,
            positions: [
                // Hard stop -40% at 3 trading days held.
                position({symbol: 'GGG', quantity: 10, avgCost: 100, price: 60, heldTradingDays: 3}),
                // Broken thesis at 1 trading day held.
                position({symbol: 'HHH', quantity: 5, avgCost: 20, price: 25, heldTradingDays: 1, thesisBroken: true}),
            ],
            targets: [],
        });
        expect(orders.map((o) => o.symbol).sort()).toEqual(['GGG', 'HHH']);
        expect(orders.every((o) => o.side === 'sell')).toBe(true);
    });
});

describe('diffToOrders — rebalance band and drift', () => {
    it('suppresses drifts inside the rebalance band on both sides', () => {
        const orders = diffToOrders({
            totalValue: 100_000,
            cash: 50_000,
            positions: [
                // +2k drift (0.10 → 0.12): below the 5k band.
                position({symbol: 'AAA', quantity: 100, avgCost: 100, price: 100, heldTradingDays: 100, score: 0.5}),
                // -4k drift (0.10 → 0.06): below the 5k band.
                position({symbol: 'BBB', quantity: 100, avgCost: 100, price: 100, heldTradingDays: 100, score: 0.5}),
            ],
            targets: [targetOf('AAA', 0.12), targetOf('BBB', 0.06)],
        });
        expect(orders).toEqual([]);
    });

    it('buys toward a held target with a deterministic rebalance reason', () => {
        const orders = diffToOrders({
            totalValue: 100_000,
            cash: 20_000,
            positions: [position({symbol: 'AAA', quantity: 100, avgCost: 100, price: 100, heldTradingDays: 100, score: 0.5})],
            targets: [targetOf('AAA', 0.18)],
        });
        expect(orders).toHaveLength(1);
        expect(orders[0]).toMatchObject({symbol: 'AAA', side: 'buy', quantity: 80});
        expect(orders[0].reason).toBe('rebalance +8.0% drift toward 18.0% target');
    });

    it('enters a new position with whole-share flooring and an enter reason', () => {
        const orders = diffToOrders({
            totalValue: 100_000,
            cash: 100_000,
            // Quantity-0 row carries the live quote for the not-yet-held target.
            positions: [position({symbol: 'KKK', quantity: 0, price: 70})],
            targets: [targetOf('KKK', 0.15)],
        });
        expect(orders).toHaveLength(1);
        // 15_000 / 70 = 214.28... → 214 whole shares.
        expect(orders[0]).toMatchObject({symbol: 'KKK', side: 'buy', quantity: 214, reason: 'enter: score 0.30'});
    });

    it('drops orders that floor to less than one share', () => {
        const orders = diffToOrders({
            totalValue: 100_000,
            cash: 100_000,
            // 6k drift clears the band, but a 7k share price floors to 0 shares.
            positions: [position({symbol: 'LLL', quantity: 0, price: 7_000})],
            targets: [targetOf('LLL', 0.06)],
        });
        expect(orders).toEqual([]);
    });
});

describe('diffToOrders — null prices', () => {
    it('skips a held symbol with no live quote even when a trigger fires', () => {
        const orders = diffToOrders({
            totalValue: 100_000,
            cash: 10_000,
            positions: [position({symbol: 'III', quantity: 10, avgCost: 100, price: null, heldTradingDays: 100, thesisBroken: true})],
            targets: [],
        });
        expect(orders).toEqual([]);
    });

    it('skips targets whose only price row is null and targets with no price row at all', () => {
        const orders = diffToOrders({
            totalValue: 100_000,
            cash: 100_000,
            positions: [position({symbol: 'JJJ', quantity: 0, price: null})],
            targets: [targetOf('JJJ', 0.15), targetOf('NOPRICE', 0.15)],
        });
        expect(orders).toEqual([]);
    });
});

describe('diffToOrders — ordering, trade cap, and cash floor', () => {
    it('emits sells first, each side sorted by |drift| desc', () => {
        const orders = diffToOrders({
            totalValue: 100_000,
            cash: 20_000,
            positions: [
                // Trim: 0.20 → 0.12 = -8k drift.
                position({symbol: 'AAA', quantity: 200, avgCost: 100, price: 100, heldTradingDays: 30, score: 0.5}),
                // Thesis exit worth 6k.
                position({symbol: 'BBB', quantity: 30, avgCost: 150, price: 200, heldTradingDays: 100, thesisBroken: true}),
                // New entry quote row.
                position({symbol: 'CCC', quantity: 0, price: 100}),
            ],
            targets: [targetOf('AAA', 0.12), targetOf('CCC', 0.15)],
        });
        expect(orders).toEqual([
            {symbol: 'AAA', side: 'sell', quantity: 80, reason: 'rebalance -8.0% drift toward 12.0% target'},
            {symbol: 'BBB', side: 'sell', quantity: 30, reason: 'exit: thesis broken'},
            {symbol: 'CCC', side: 'buy', quantity: 150, reason: 'enter: score 0.30'},
        ]);
    });

    it('caps at MAX_TRADES_PER_WEEK, keeping the largest |drift| candidates', () => {
        const orders = diffToOrders({
            totalValue: 100_000,
            cash: 100_000,
            positions: [
                position({symbol: 'DDD', quantity: 0, price: 100}),
                position({symbol: 'EEE', quantity: 0, price: 100}),
                position({symbol: 'FFF', quantity: 0, price: 100}),
                position({symbol: 'GGG', quantity: 0, price: 100}),
            ],
            targets: [
                targetOf('GGG', 0.12), // smallest drift — should be the one cut
                targetOf('DDD', 0.20),
                targetOf('FFF', 0.15),
                targetOf('EEE', 0.18),
            ],
        });
        expect(orders).toHaveLength(MAX_TRADES_PER_WEEK);
        expect(orders.map((o) => o.symbol)).toEqual(['DDD', 'EEE', 'FFF']);
    });

    it('trims a buy so post-buy cash stays at or above the cash floor (exact quantity)', () => {
        const orders = diffToOrders({
            totalValue: 100_000,
            cash: 14_000,
            positions: [position({symbol: 'HHH', quantity: 0, price: 50})],
            targets: [targetOf('HHH', 0.12)],
        });
        // Desired: floor(12_000 / 50) = 240 shares. Cash above the 10_000 floor
        // is 4_000 → floor(4_000 / 50) = 80 shares. Post-buy cash lands on 10_000.
        expect(orders).toHaveLength(1);
        expect(orders[0]).toMatchObject({symbol: 'HHH', side: 'buy', quantity: 80});
    });

    it('lets sell proceeds fund buys, and a trimmed-to-zero buy frees its trade slot', () => {
        const orders = diffToOrders({
            totalValue: 200_000, // band 10k, cash floor 20k
            cash: 21_000,
            positions: [
                // Trim: 0.20 → 0.14 = -12k drift → sell 120 @ 100.
                position({symbol: 'LLL', quantity: 400, avgCost: 50, price: 100, heldTradingDays: 30, score: 0.5}),
                // Thesis exit worth 3k → sell 10 @ 300.
                position({symbol: 'KKK', quantity: 10, avgCost: 300, price: 300, heldTradingDays: 100, thesisBroken: true}),
                // Quote rows for the two entry candidates.
                position({symbol: 'MMM', quantity: 0, price: 20_000}),
                position({symbol: 'NNN', quantity: 0, price: 100}),
            ],
            targets: [
                targetOf('LLL', 0.14),
                targetOf('MMM', 0.15), // 30k drift → 1 share @ 20k, unaffordable above the floor
                targetOf('NNN', 0.07), // 14k drift → 140 shares @ 100
            ],
        });
        // Cash walk: 21k + 12k + 3k = 36k after sells; 16k above the floor.
        // MMM needs 20k → trimmed to 0 → dropped, freeing the third slot for NNN.
        expect(orders).toEqual([
            {symbol: 'LLL', side: 'sell', quantity: 120, reason: 'rebalance -6.0% drift toward 14.0% target'},
            {symbol: 'KKK', side: 'sell', quantity: 10, reason: 'exit: thesis broken'},
            {symbol: 'NNN', side: 'buy', quantity: 140, reason: 'enter: score 0.30'},
        ]);
    });
});
