import {describe, expect, it} from 'vitest';
import {STRATEGIES} from '@/lib/strategies/catalog';
import {slotWeight} from '@/lib/strategies/config';
import {STRATEGY_RULES} from '@/lib/strategies/rules';
import {LARGE_CAPS, SECTOR_ETFS, UNIVERSES} from '@/lib/strategies/universe';
import {
    ASOF,
    containsNaN,
    definition,
    donchianChannel,
    dualLegs,
    flat,
    FULL_WEIGHT,
    genericContext,
    GOLDEN_CROSS_XLK,
    lowVolWobble,
    makeContext,
    N,
    rowFor,
    RSI_RISING,
    rsiDipped,
    seriesFor,
    SIXTY_FORTY_DRIFTED,
    symbolsInState,
    targetFor,
    trend,
} from '@/lib/strategies/__tests__/fixtures';

// Context builders and series shapes live in fixtures.ts, shared with the reason
// decoder round trip in lib/learn so both run on the strings the rules really emit.

// ---------------------------------------------------------------------------

describe('buy-and-hold-spy', () => {
    const def = definition('buy-and-hold-spy');
    const decide = STRATEGY_RULES[def.id];

    it('targets SPY on the first run and is not done until the position exists', () => {
        const decision = decide(def, makeContext({def, series: {SPY: trend(100, 110)}}));
        // Not yet done: a bounced fill must re-plan tomorrow rather than stay in cash forever.
        expect(decision.rebalanceTriggered).toBe(false);
        expect(decision.targets).toEqual([
            {symbol: 'SPY', weight: FULL_WEIGHT, reason: 'initial deployment: buy and hold SPY'},
        ]);
        expect(rowFor(decision, 'SPY')).toEqual({symbol: 'SPY', state: 'enter', values: {close: 110, sinceEntry: null}});
    });

    it('marks itself done on the first fresh day the position exists', () => {
        const decision = decide(def, makeContext({
            def,
            series: {SPY: trend(100, 110)},
            holdings: [{symbol: 'SPY', quantity: 900, avgCost: 100}],
            lastRebalanceDate: null,
        }));
        expect(decision.rebalanceTriggered).toBe(true);
        expect(decision.targets).toEqual([]);
        expect(rowFor(decision, 'SPY')?.state).toBe('held');
    });

    it('never trades again once it has bought', () => {
        const decision = decide(def, makeContext({
            def,
            series: {SPY: trend(100, 110)},
            holdings: [{symbol: 'SPY', quantity: 900, avgCost: 100}],
            lastRebalanceDate: '2026-01-05',
        }));
        expect(decision.rebalanceTriggered).toBe(false);
        expect(decision.targets).toEqual([]);
        expect(rowFor(decision, 'SPY')?.state).toBe('held');
        expect(rowFor(decision, 'SPY')?.values.sinceEntry).toBeCloseTo(0.1);
    });

    it('defers (not done) when SPY is stale on the first run', () => {
        const decision = decide(def, makeContext({def, series: {SPY: trend(100, 110)}, stale: ['SPY']}));
        expect(decision.rebalanceTriggered).toBe(false);
        expect(decision.targets).toEqual([]);
        expect(decision.dataIssues).toEqual([`SPY: stale: no bar for ${ASOF}; initial purchase deferred`]);
        expect(rowFor(decision, 'SPY')).toMatchObject({state: 'excluded', note: `stale: no bar for ${ASOF}`});
    });
});

describe('sixty-forty', () => {
    const def = definition('sixty-forty');
    const decide = STRATEGY_RULES[def.id];
    const drifted = SIXTY_FORTY_DRIFTED;

    it('emits both legs with the drift text when a new quarter is due', () => {
        const decision = decide(def, makeContext({
            def, ...drifted, asOf: '2026-09-30', tradeDate: '2026-10-01', lastRebalanceDate: '2026-07-01',
        }));
        expect(decision.rebalanceTriggered).toBe(true);
        expect(decision.targets.map((target) => target.symbol)).toEqual(['SPY', 'AGG']);
        expect(targetFor(decision, 'SPY')?.weight).toBeCloseTo(0.594);
        expect(targetFor(decision, 'AGG')?.weight).toBeCloseTo(0.396);
        expect(targetFor(decision, 'SPY')?.reason).toBe('quarterly rebalance: SPY 63.2% → 59.4% target');
        expect(targetFor(decision, 'AGG')?.reason).toBe('quarterly rebalance: AGG 35.0% → 39.6% target');
        expect(rowFor(decision, 'SPY')?.values.weight).toBeCloseTo(0.632);
        expect(rowFor(decision, 'SPY')?.values.drift).toBeCloseTo(0.038);
    });

    it('publishes the board but no targets inside a quarter', () => {
        const decision = decide(def, makeContext({def, ...drifted, lastRebalanceDate: '2026-07-01'}));
        expect(decision.rebalanceTriggered).toBe(false);
        expect(decision.targets).toEqual([]);
        expect(symbolsInState(decision, 'held')).toEqual(['SPY', 'AGG']);
        expect(rowFor(decision, 'AGG')?.values.target).toBeCloseTo(0.396);
    });

    it('enters from cash on the first run', () => {
        const decision = decide(def, makeContext({def, series: drifted.series}));
        expect(decision.targets.map((target) => target.reason)).toEqual([
            'enter: SPY 0.0% → 59.4% target',
            'enter: AGG 0.0% → 39.6% target',
        ]);
        expect(symbolsInState(decision, 'enter')).toEqual(['SPY', 'AGG']);
    });

    it('defers the whole rebalance when a leg is stale', () => {
        const decision = decide(def, makeContext({def, ...drifted, stale: ['AGG'], lastRebalanceDate: null}));
        expect(decision.rebalanceTriggered).toBe(false);
        expect(decision.targets).toEqual([]);
        expect(decision.dataIssues[0]).toContain('AGG: stale: no bar for');
        expect(rowFor(decision, 'AGG')?.state).toBe('excluded');
    });
});

describe('golden-cross', () => {
    const def = definition('golden-cross');
    const decide = STRATEGY_RULES[def.id];
    const rest = SECTOR_ETFS.filter((symbol) => symbol !== 'XLK');
    const xlk = GOLDEN_CROSS_XLK;

    it('enters on the bar SMA50 first exceeds SMA200, holds, and exits when it drops back', () => {
        let held: string[] = [];
        const events: {day: number; kind: string; trendBefore: unknown; trendNow: unknown}[] = [];
        let previousTrend: unknown = null;
        for (let day = N - 1; day < xlk.length; day += 1) {
            const window = xlk.slice(day - N + 1, day + 1);
            const ctx = makeContext({
                def,
                series: {XLK: window, ...seriesFor(rest, () => flat(N, 100))},
                holdings: held.map((symbol) => ({symbol, quantity: 10})),
            });
            const decision = decide(def, ctx);
            expect(decision.rebalanceTriggered).toBe(true);
            const row = rowFor(decision, 'XLK');
            const target = targetFor(decision, 'XLK');
            if (row?.state === 'enter') {
                events.push({day, kind: 'enter', trendBefore: previousTrend, trendNow: row.values.trendOn});
                expect(target?.weight).toBeCloseTo(slotWeight(11));
                expect(target?.reason).toMatch(/^enter: SMA50 \d+\.\d{2} > SMA200 \d+\.\d{2} \(\+\d+\.\d%\)$/);
                held = ['XLK'];
            } else if (row?.state === 'exit') {
                events.push({day, kind: 'exit', trendBefore: previousTrend, trendNow: row.values.trendOn});
                expect(target).toEqual({symbol: 'XLK', weight: 0, reason: expect.stringMatching(/^exit: SMA50 \d+\.\d{2} ≤ SMA200 \d+\.\d{2}$/)});
                held = [];
            } else if (row?.state === 'held') {
                expect(target?.weight).toBeCloseTo(slotWeight(11));
                expect(target?.reason).toMatch(/^hold: SMA50/);
            } else {
                expect(target).toBeUndefined();
            }
            previousTrend = row?.values.trendOn;
        }
        expect(events.map((event) => event.kind)).toEqual(['enter', 'exit']);
        expect(events[0]).toMatchObject({trendBefore: false, trendNow: true});
        expect(events[1]).toMatchObject({trendBefore: true, trendNow: false});
    });

    it('treats an equal pair of averages as off and excludes short histories', () => {
        const decision = decide(def, makeContext({
            def,
            series: {XLK: flat(150, 100), ...seriesFor(rest, () => flat(N, 100))},
            holdings: [{symbol: 'XLK', quantity: 10}, {symbol: 'XLE', quantity: 10}],
        }));
        expect(rowFor(decision, 'XLK')).toMatchObject({state: 'excluded', note: 'needs 200 bars'});
        expect(decision.dataIssues).toEqual(['XLK: held but needs 200 bars; kept']);
        expect(targetFor(decision, 'XLK')).toBeUndefined();
        // Flat: SMA50 == SMA200, not strictly above → a held one exits.
        expect(targetFor(decision, 'XLE')).toEqual({symbol: 'XLE', weight: 0, reason: 'exit: SMA50 100.00 ≤ SMA200 100.00'});
        expect(symbolsInState(decision, 'watch').length).toBe(rest.length - 1);
    });
});

describe('dual-momentum', () => {
    const def = definition('dual-momentum');
    const decide = STRATEGY_RULES[def.id];
    const legs = dualLegs;

    it('picks AGG when SPY trails T-bills on total return although price return says otherwise', () => {
        const decision = decide(def, makeContext({
            def,
            series: legs({
                SPY: {price: 0.05, total: 0.01},
                EFA: {price: 0.0, total: 0.0},
                AGG: {price: 0.0, total: 0.02},
                BIL: {price: 0.0, total: 0.04},
            }),
        }));
        expect(decision.rebalanceTriggered).toBe(true);
        expect(decision.targets).toEqual([
            {symbol: 'AGG', weight: FULL_WEIGHT, reason: 'monthly: SPY 12m +1.0% ≤ T-bill +4.0% → AGG (absolute momentum off)'},
        ]);
        expect(rowFor(decision, 'SPY')?.values).toEqual({close: 105, r12: expect.closeTo(0.01, 6), aboveHurdle: false, pick: false});
        expect(rowFor(decision, 'BIL')?.values.aboveHurdle).toBeNull();
        expect(rowFor(decision, 'AGG')?.state).toBe('enter');
    });

    it('picks SPY over EFA when both beat the hurdle and rotates the old leg out', () => {
        const decision = decide(def, makeContext({
            def,
            series: legs({
                SPY: {price: 0.15, total: 0.182},
                EFA: {price: 0.1, total: 0.121},
                AGG: {price: 0.0, total: 0.02},
                BIL: {price: 0.0, total: 0.049},
            }),
            holdings: [{symbol: 'AGG', quantity: 900}],
            asOf: '2026-09-30',
            tradeDate: '2026-10-01',
            lastRebalanceDate: '2026-09-01',
        }));
        expect(decision.targets).toEqual([
            {symbol: 'SPY', weight: FULL_WEIGHT, reason: 'monthly: SPY 12m +18.2% > T-bill +4.9% and ≥ EFA +12.1% → SPY'},
            {symbol: 'AGG', weight: 0, reason: 'exit: rotated to SPY'},
        ]);
        expect(rowFor(decision, 'AGG')?.state).toBe('exit');
        expect(rowFor(decision, 'SPY')?.state).toBe('enter');
    });

    it('picks EFA when it beats SPY', () => {
        const decision = decide(def, makeContext({
            def,
            series: legs({
                SPY: {price: 0.1, total: 0.1},
                EFA: {price: 0.2, total: 0.2},
                AGG: {price: 0.0, total: 0.0},
                BIL: {price: 0.0, total: 0.03},
            }),
            holdings: [{symbol: 'SPY', quantity: 900}],
        }));
        expect(decision.targets[0]).toEqual({
            symbol: 'EFA', weight: FULL_WEIGHT, reason: 'monthly: SPY 12m +10.0% > T-bill +3.0% but < EFA +20.0% → EFA',
        });
        expect(targetFor(decision, 'SPY')).toEqual({symbol: 'SPY', weight: 0, reason: 'exit: rotated to EFA'});
    });

    it('defers when the pick is stale and never sells the other legs blind', () => {
        const decision = decide(def, makeContext({
            def,
            series: legs({
                SPY: {price: 0.05, total: 0.01},
                EFA: {price: 0.0, total: 0.0},
                AGG: {price: 0.0, total: 0.02},
                BIL: {price: 0.0, total: 0.04},
            }),
            stale: ['AGG'],
            holdings: [{symbol: 'SPY', quantity: 900}],
        }));
        expect(decision.rebalanceTriggered).toBe(false);
        expect(decision.targets).toEqual([]);
        expect(decision.dataIssues).toEqual([`AGG: stale: no bar for ${ASOF}; rebalance deferred`]);
        expect(rowFor(decision, 'SPY')?.state).toBe('held');
    });

    it('falls back to a zero hurdle without BIL history and says so', () => {
        const decision = decide(def, makeContext({
            def,
            series: legs({SPY: {price: 0.05, total: 0.03}, EFA: {price: 0.0, total: 0.0}, AGG: {price: 0.0, total: 0.0}}),
        }));
        expect(decision.dataIssues).toEqual(['BIL history missing; hurdle 0']);
        expect(decision.targets[0]?.symbol).toBe('SPY');
        expect(decision.targets[0]?.reason).toContain('T-bill +0.0%');
    });

    it('only publishes the board on a non-due day', () => {
        const decision = decide(def, makeContext({
            def,
            series: legs({SPY: {price: 0.05, total: 0.03}, EFA: {price: 0.0, total: 0.0}, AGG: {price: 0.0, total: 0.0}, BIL: {price: 0, total: 0.01}}),
            holdings: [{symbol: 'AGG', quantity: 900}],
            lastRebalanceDate: '2026-09-01',
        }));
        expect(decision.rebalanceTriggered).toBe(false);
        expect(decision.targets).toEqual([]);
        expect(rowFor(decision, 'SPY')?.values.pick).toBe(true);
        expect(rowFor(decision, 'AGG')?.state).toBe('held');
    });
});

describe('momentum-12-1', () => {
    const def = definition('momentum-12-1');
    const decide = STRATEGY_RULES[def.id];
    // Momentum grows with the index; the last two share a series to test the tie-break.
    const series = seriesFor(LARGE_CAPS, (_, index) => trend(100, 100 + Math.min(index, 38)));
    const byRank = [...LARGE_CAPS].reverse();

    it('picks the top 8 when due, alphabetical on ties, and ranks everything', () => {
        const decision = decide(def, makeContext({def, series}));
        expect(decision.rebalanceTriggered).toBe(true);
        const [tieA, tieB] = [LARGE_CAPS[38], LARGE_CAPS[39]].sort();
        expect(decision.targets.map((target) => target.symbol)).toEqual([tieA, tieB, ...byRank.slice(2, 8)]);
        for (const target of decision.targets) expect(target.weight).toBeCloseTo(slotWeight(8));
        expect(decision.targets[0].reason).toMatch(/^monthly: ranked #1\/40 by 12-1 return \(\+\d+\.\d%\)$/);
        expect(decision.targets[7].reason).toContain('#8/40');
        expect(symbolsInState(decision, 'enter').length).toBe(8);
        expect(rowFor(decision, LARGE_CAPS[0])?.values.rank).toBe(40);
        expect(rowFor(decision, tieA)?.values.rank).toBe(1);
        expect(rowFor(decision, tieB)?.values.rank).toBe(2);
    });

    it('returns hold targets for kept names and exits for dropped ones', () => {
        const decision = decide(def, makeContext({
            def,
            series,
            holdings: [{symbol: LARGE_CAPS[37], quantity: 10}, {symbol: LARGE_CAPS[0], quantity: 10}],
        }));
        expect(targetFor(decision, LARGE_CAPS[37])).toEqual({
            symbol: LARGE_CAPS[37], weight: slotWeight(8), reason: expect.stringMatching(/^hold: ranked #3\/40 by 12-1 return/),
        });
        expect(targetFor(decision, LARGE_CAPS[0])).toEqual({symbol: LARGE_CAPS[0], weight: 0, reason: 'exit: fell to #40/40 (+0.0%)'});
        expect(rowFor(decision, LARGE_CAPS[0])?.state).toBe('exit');
        expect(rowFor(decision, LARGE_CAPS[37])?.state).toBe('held');
    });

    it('publishes the full ranking without targets on a non-due day', () => {
        const decision = decide(def, makeContext({
            def, series, holdings: [{symbol: LARGE_CAPS[0], quantity: 10}], lastRebalanceDate: '2026-09-01',
        }));
        expect(decision.rebalanceTriggered).toBe(false);
        expect(decision.targets).toEqual([]);
        expect(decision.board.map((row) => row.values.rank).sort((a, b) => Number(a) - Number(b))[39]).toBe(40);
        expect(rowFor(decision, LARGE_CAPS[0])?.state).toBe('held');
    });

    it('excludes names without 253 bars and ranks the rest', () => {
        const decision = decide(def, makeContext({def, series: {...series, [LARGE_CAPS[5]]: flat(100, 100)}}));
        expect(rowFor(decision, LARGE_CAPS[5])).toMatchObject({state: 'excluded', note: 'needs 253 bars', values: {rank: null}});
        expect(decision.targets[0].reason).toContain('#1/39');
    });
});

describe('rsi2-mean-reversion', () => {
    const def = definition('rsi2-mean-reversion');
    const decide = STRATEGY_RULES[def.id];
    const rising = RSI_RISING;
    const dipped = rsiDipped;
    const DIP_COUNT = 7;
    const series = seriesFor(LARGE_CAPS, (_, index) => (index < DIP_COUNT ? dipped(0.5 + 0.25 * index) : rising));
    const strongestFirst = LARGE_CAPS.slice(0, DIP_COUNT).reverse();

    it('enters the lowest-RSI candidates up to the open slots', () => {
        const decision = decide(def, makeContext({def, series}));
        expect(decision.rebalanceTriggered).toBe(true);
        expect(decision.targets.map((target) => target.symbol)).toEqual(strongestFirst.slice(0, 5));
        for (const target of decision.targets) {
            expect(target.weight).toBeCloseTo(slotWeight(5));
            expect(target.reason).toMatch(/^enter: RSI\(2\) \d+\.\d < 10 with close \d+\.\d{2} above SMA200 \d+\.\d{2}$/);
        }
        expect([...symbolsInState(decision, 'enter')].sort()).toEqual([...strongestFirst.slice(0, 5)].sort());
        for (const symbol of strongestFirst.slice(5)) {
            expect(rowFor(decision, symbol)).toMatchObject({state: 'watch', note: 'signal, but no open slot'});
        }
        expect(rowFor(decision, LARGE_CAPS[20])?.state).toBe('watch');
        expect(rowFor(decision, LARGE_CAPS[20])?.values.rsi2).toBe(100);
    });

    it('exits on a close above SMA5 first, counts every holding against the slots, and never re-enters an exit', () => {
        const decision = decide(def, makeContext({
            def,
            series: {...series, [LARGE_CAPS[20]]: dipped(1)},
            stale: [LARGE_CAPS[30]],
            holdings: [
                {symbol: LARGE_CAPS[10], quantity: 10},
                {symbol: LARGE_CAPS[11], quantity: 10},
                {symbol: LARGE_CAPS[20], quantity: 10},
                {symbol: LARGE_CAPS[30], quantity: 10},
            ],
        }));
        const exits = decision.targets.filter((target) => target.weight === 0);
        expect(exits.map((target) => target.symbol)).toEqual([LARGE_CAPS[10], LARGE_CAPS[11]]);
        expect(exits[0].reason).toMatch(/^exit: close \d+\.\d{2} > SMA5 \d+\.\d{2}$/);
        // 4 held, 2 exiting → 3 open slots; the dipped-but-held name gets no target.
        const enters = decision.targets.filter((target) => target.weight > 0);
        expect(enters.map((target) => target.symbol)).toEqual(strongestFirst.slice(0, 3));
        expect(targetFor(decision, LARGE_CAPS[20])).toBeUndefined();
        expect(rowFor(decision, LARGE_CAPS[20])?.state).toBe('held');
        expect(rowFor(decision, LARGE_CAPS[30])).toMatchObject({state: 'excluded', note: `stale: no bar for ${ASOF}`});
        expect(decision.dataIssues).toEqual([`${LARGE_CAPS[30]}: held but stale: no bar for ${ASOF}; kept`]);
        for (const symbol of [LARGE_CAPS[10], LARGE_CAPS[11]]) {
            expect(enters.some((target) => target.symbol === symbol)).toBe(false);
        }
    });

    it('excludes short histories and skips stale candidates', () => {
        const decision = decide(def, makeContext({
            def,
            series: {...series, [LARGE_CAPS[8]]: flat(150, 100)},
            stale: [LARGE_CAPS[6]],
        }));
        expect(rowFor(decision, LARGE_CAPS[8])).toMatchObject({state: 'excluded', note: 'needs 200 bars'});
        expect(targetFor(decision, LARGE_CAPS[6])).toBeUndefined();
        expect(decision.targets.map((target) => target.symbol)).toEqual(strongestFirst.slice(1, 6));
    });
});

describe('donchian-breakout', () => {
    const def = definition('donchian-breakout');
    const decide = STRATEGY_RULES[def.id];
    const channel = donchianChannel;
    const BREAKOUT_COUNT = 10;
    const series = seriesFor(LARGE_CAPS, (_, index) => channel(index < BREAKOUT_COUNT ? 101 + 0.5 * index : 100));

    it('needs a strict breakout, fills slots strongest first, and exits below the 20-day low', () => {
        const decision = decide(def, makeContext({
            def,
            series: {...series, [LARGE_CAPS[20]]: channel(98.5), [LARGE_CAPS[21]]: channel(99)},
            holdings: [{symbol: LARGE_CAPS[20], quantity: 10}, {symbol: LARGE_CAPS[21], quantity: 10}],
        }));
        expect(decision.rebalanceTriggered).toBe(true);
        // Close 101 equals the 55-day high: not a breakout.
        expect(rowFor(decision, LARGE_CAPS[0])?.state).toBe('watch');
        expect(targetFor(decision, LARGE_CAPS[0])).toBeUndefined();
        expect(targetFor(decision, LARGE_CAPS[20])).toEqual({
            symbol: LARGE_CAPS[20], weight: 0, reason: 'exit: close 98.50 < 20-day low 99.00',
        });
        // Close equal to the 20-day low is not an exit.
        expect(targetFor(decision, LARGE_CAPS[21])).toBeUndefined();
        expect(rowFor(decision, LARGE_CAPS[21])?.state).toBe('held');
        // 2 held, 1 exiting → 7 open slots out of 9 breakouts.
        const enters = decision.targets.filter((target) => target.weight > 0);
        expect(enters.map((target) => target.symbol)).toEqual(LARGE_CAPS.slice(3, 10).reverse());
        expect(enters[0]).toEqual({
            symbol: LARGE_CAPS[9], weight: slotWeight(8), reason: 'enter: close 105.50 broke the 55-day high 101.00 (+4.5%)',
        });
        for (const symbol of [LARGE_CAPS[1], LARGE_CAPS[2]]) {
            expect(rowFor(decision, symbol)).toMatchObject({state: 'watch', note: 'signal, but no open slot'});
        }
        expect(rowFor(decision, LARGE_CAPS[9])?.values).toEqual({close: 105.5, high55: 101, low20: 99, vsHigh: expect.closeTo(0.04455, 4)});
    });

    it('excludes names without highs and lows, keeping a held one with a data issue', () => {
        const decision = decide(def, makeContext({
            def,
            series: {...series, [LARGE_CAPS[5]]: flat(N, 100), [LARGE_CAPS[6]]: flat(N, 100)},
            holdings: [{symbol: LARGE_CAPS[5], quantity: 10}],
        }));
        expect(rowFor(decision, LARGE_CAPS[5])).toMatchObject({state: 'excluded', note: 'needs 56 bars with highs/lows'});
        expect(rowFor(decision, LARGE_CAPS[6])?.state).toBe('excluded');
        expect(decision.dataIssues).toEqual([`${LARGE_CAPS[5]}: held but needs 56 bars with highs/lows; kept`]);
        expect(targetFor(decision, LARGE_CAPS[5])).toBeUndefined();
        expect(decision.targets.length).toBe(7);
    });
});

describe('low-volatility', () => {
    const def = definition('low-volatility');
    const decide = STRATEGY_RULES[def.id];
    const wobble = lowVolWobble;
    const series = seriesFor(LARGE_CAPS, (_, index) => wobble(0.5 * (Math.max(index, 1))));

    it('holds the ten calmest when due, alphabetical on ties', () => {
        const decision = decide(def, makeContext({def, series}));
        expect(decision.rebalanceTriggered).toBe(true);
        const [tieA, tieB] = [LARGE_CAPS[0], LARGE_CAPS[1]].sort();
        expect(decision.targets.map((target) => target.symbol)).toEqual([tieA, tieB, ...LARGE_CAPS.slice(2, 10)]);
        for (const target of decision.targets) expect(target.weight).toBeCloseTo(slotWeight(10));
        expect(decision.targets[0].reason).toMatch(/^monthly: 63-day realised vol \d+\.\d% ranks #1\/40 lowest$/);
        expect(rowFor(decision, LARGE_CAPS[39])?.values.rank).toBe(40);
    });

    it('exits a held name that fell out of the ten and holds a kept one', () => {
        const decision = decide(def, makeContext({
            def, series, holdings: [{symbol: LARGE_CAPS[39], quantity: 10}, {symbol: LARGE_CAPS[5], quantity: 10}],
        }));
        expect(targetFor(decision, LARGE_CAPS[39])).toEqual({
            symbol: LARGE_CAPS[39], weight: 0, reason: expect.stringMatching(/^exit: vol rank fell to #40\/40 \(\d+\.\d%\)$/),
        });
        expect(targetFor(decision, LARGE_CAPS[5])?.reason).toMatch(/^hold: 63-day realised vol/);
    });

    it('publishes ranks without targets on a non-due day and excludes short histories', () => {
        const decision = decide(def, makeContext({
            def, series: {...series, [LARGE_CAPS[3]]: flat(50, 100)}, lastRebalanceDate: '2026-09-01',
        }));
        expect(decision.rebalanceTriggered).toBe(false);
        expect(decision.targets).toEqual([]);
        expect(rowFor(decision, LARGE_CAPS[3])).toMatchObject({state: 'excluded', note: 'needs 64 bars'});
        expect(rowFor(decision, LARGE_CAPS[2])?.values.rank).toBe(3);
    });
});

// ---------------------------------------------------------------------------
// Properties every rule must satisfy.

describe.each(STRATEGIES.map((def) => [def.id, def] as const))('%s', (_, def) => {
    const decide = STRATEGY_RULES[def.id];
    const universe = UNIVERSES[def.universe];

    it('publishes one row per universe symbol, keyed by its signal columns, plus held strays', () => {
        const decision = decide(def, genericContext(def));
        expect(decision.board.slice(0, universe.length).map((row) => row.symbol)).toEqual([...universe]);
        expect(decision.board.length).toBe(universe.length + 1);
        expect(decision.board[universe.length]).toEqual({
            symbol: 'ZZZ', state: 'held', values: expect.any(Object), note: 'left the universe',
        });
        const keys = def.signalColumns.map((column) => column.key).sort();
        for (const row of decision.board) {
            expect(Object.keys(row.values).sort()).toEqual(keys);
            for (const value of Object.values(row.values)) {
                expect(['number', 'string', 'boolean']).toContain(value === null ? 'string' : typeof value);
            }
        }
    });

    it('excludes a stale symbol and never targets it', () => {
        const decision = decide(def, genericContext(def));
        expect(rowFor(decision, universe[0])).toMatchObject({state: 'excluded', note: `stale: no bar for ${ASOF}`});
        expect(targetFor(decision, universe[0])).toBeUndefined();
        for (const target of decision.targets) {
            expect(target.weight).toBeGreaterThanOrEqual(0);
            expect(target.weight).toBeLessThanOrEqual(FULL_WEIGHT + 1e-9);
            expect(target.reason.length).toBeGreaterThan(0);
        }
    });

    it('is deterministic and never emits NaN', () => {
        const ctx = genericContext(def);
        const first = decide(def, ctx);
        const second = decide(def, ctx);
        expect(second).toEqual(first);
        expect(containsNaN(first)).toBe(false);
    });
});
