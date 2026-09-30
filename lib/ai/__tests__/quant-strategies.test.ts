// The getQuantStrategies tool's output is data for the model, shaped here and nowhere else:
// the /strategies leaderboard rows with their numbers rounded, and for one strategy its latest
// decision — each reason decoded clause by clause with the strategy's own definition — plus
// the few top rows of the board it is watching, in the board's own order. One constant stance
// line rides on every shape. These tests drive the shaper with the same catalog, decoder and
// narrator the tool calls, so nothing here can define a term the app does not.

import {describe, expect, it} from 'vitest';
import {
    QUANT_LIMITS,
    QUANT_NOTES,
    QUANT_STANCE,
    resolveStrategy,
    shapeQuantLeaderboard,
    shapeQuantStrategy,
    shapeUnknownStrategy,
} from '@/lib/ai/quant-strategies';
import {GLOSSARY} from '@/lib/learn/glossary';
import {findBanned} from '@/lib/learn/banned';
import {narrateBoard} from '@/lib/learn/board-narration';
import {STRATEGIES, strategyBySlug} from '@/lib/strategies/catalog';
import {sortBoard, type LiveRecord, type StrategyLeaderboardRow, type StrategyRunView} from '@/lib/strategies/views';
import type {RowState, SignalRow, StrategyDefinition, StrategyId} from '@/lib/strategies/types';

const def = (id: StrategyId): StrategyDefinition => {
    const found = strategyBySlug(id);
    if (!found) throw new Error(`no definition for ${id}`);
    return found;
};

const GC = def('golden-cross');

const liveRecord = (over: Partial<LiveRecord> = {}): LiveRecord => ({
    totalValue: 101_234.5,
    totalReturnPct: 1.23456,
    benchmarkReturnPct: 0.98765,
    maxDrawdownPct: 2.34567,
    winRatePct: 50,
    fills: 12,
    holdings: 3,
    unpriced: 0,
    snapshotDays: 5,
    // 10:00 in New York on 21 September.
    inceptionAt: Date.parse('2026-09-21T14:00:00Z'),
    spark: [0, 0.5, 1.23456],
    ...over,
});

const leaderboardRow = (id: StrategyId, over: Partial<StrategyLeaderboardRow> = {}): StrategyLeaderboardRow => {
    const d = def(id);
    return {
        id, name: d.name, family: d.family, cadence: d.cadence, launchDate: '2026-09-21', lastError: null,
        live: liveRecord(),
        simulated: {from: '2023-09-21', to: '2026-09-18', stats: {
            totalReturnPct: 31.4159, cagrPct: 9.5, annualizedVolPct: 12, maxDrawdownPct: 14.2, winRatePct: 55,
            wins: 11, losses: 9, tradeCount: 48, benchmarkReturnPct: 40.1, excessReturnPct: -8.7,
        }, closeFills: 0, spark: [0, 31.4159]},
        followed: false,
        beginnerLine: d.explainer.beginnerLine,
        ...over,
    };
};

const row = (symbol: string, state: RowState, values: SignalRow['values'], note?: string): SignalRow =>
    ({symbol, state, values, ...(note ? {note} : {})});

// The golden-cross board qa-learn seeds, plus enough watched rows to be cut.
const cross = (symbol: string, state: RowState, sma50: number, sma200: number, note?: string): SignalRow =>
    row(symbol, state, {close: sma50, sma50, sma200, spread: sma50 / sma200 - 1, trendOn: sma50 > sma200}, note);

const BOARD: SignalRow[] = [
    cross('XLK', 'held', 210.5, 198.2),
    cross('XLF', 'enter', 42.1, 40),
    cross('XLE', 'exit', 80, 81),
    cross('XLU', 'watch', 70, 72),
    cross('XLB', 'watch', 90, 91),
    cross('XLRE', 'watch', 40, 41),
    row('XLP', 'excluded', {close: null, sma50: null, sma200: null, spread: null, trendOn: null}, 'needs 200 bars'),
];

const GOLDEN_CROSS = 'enter: SMA50 42.10 > SMA200 40.00 (+5.3%)';

const run = (over: Partial<StrategyRunView> = {}): StrategyRunView => ({
    date: '2026-09-22', asOf: '2026-09-21', mode: 'live', status: 'done', staleCount: 0, universeSize: 11,
    rebalanceTriggered: true, board: BOARD,
    orders: [
        {symbol: 'XLF', side: 'buy', quantity: 213, kind: 'enter', reason: GOLDEN_CROSS, executed: true, price: 42.3456, message: null},
        {symbol: 'XLE', side: 'sell', quantity: 110, kind: 'exit', reason: 'exit: SMA50 80.00 ≤ SMA200 81.00 (-1.2%)', executed: false, price: null, message: 'no fresh quote'},
    ],
    skippedOrders: [{symbol: 'XLRE', reason: 'below one share'}],
    dataIssues: [],
    equity: 100_000,
    summary: '2 orders',
    ...over,
});

describe('resolveStrategy', () => {
    it('takes a slug, a name, or a unique squashed spelling', () => {
        expect(resolveStrategy('golden-cross')?.id).toBe('golden-cross');
        expect(resolveStrategy('  Golden Cross Sectors ')?.id).toBe('golden-cross');
        expect(resolveStrategy('golden cross')?.id).toBe('golden-cross');
        expect(resolveStrategy('RSI-2')?.id).toBe('rsi2-mean-reversion');
        expect(resolveStrategy('rsi2')?.id).toBe('rsi2-mean-reversion');
        expect(resolveStrategy('60/40')?.id).toBe('sixty-forty');
        expect(resolveStrategy('donchian')?.id).toBe('donchian-breakout');
    });

    it('matches nothing rather than guessing between two', () => {
        // Dual momentum and 12-1 momentum both carry the word.
        expect(resolveStrategy('momentum')).toBeNull();
        expect(resolveStrategy('ab')).toBeNull();
        expect(resolveStrategy('   ')).toBeNull();
        expect(resolveStrategy('covered calls')).toBeNull();
    });

    it('treats a pattern-shaped query as plain text', () => {
        for (const query of ['(.*)+[', '\\d{4}$', '.*', 'golden|rsi', '[a-z]+']) {
            expect(() => resolveStrategy(query), query).not.toThrow();
            expect(resolveStrategy(query), query).toBeNull();
        }
    });
});

describe('shapeQuantLeaderboard', () => {
    it("keeps the page's order and rounds every number", () => {
        const rows = [leaderboardRow('golden-cross'), leaderboardRow('buy-and-hold-spy', {live: liveRecord({totalReturnPct: 0.5, benchmarkReturnPct: 0.5})})];
        const out = shapeQuantLeaderboard(rows);
        expect(out.strategies.map((s) => s.slug)).toEqual(['golden-cross', 'buy-and-hold-spy']);
        expect(out.strategies[0]).toEqual({
            slug: 'golden-cross',
            name: 'Golden Cross Sectors',
            family: 'Trend following',
            cadence: 'daily',
            followed: false,
            live: {
                returnPct: 1.23,
                spyReturnPct: 0.99,
                vsSpyPct: 0.25,
                maxDrawdownPct: 2.35,
                fills: 12,
                holdings: 3,
                unpricedHoldings: 0,
                since: '2026-09-21',
            },
            simulated: {returnPct: 31.42, from: '2023-09-21', to: '2026-09-18', fills: 48},
        });
        expect(out.strategies[1].live?.vsSpyPct).toBe(0);
        expect(out.notes).toEqual([]);
    });

    it('dates the live record in New York, not UTC', () => {
        // 22:00 in New York on the 21st is already the 22nd in UTC.
        const out = shapeQuantLeaderboard([leaderboardRow('golden-cross', {live: liveRecord({inceptionAt: Date.parse('2026-09-22T02:00:00Z')})})]);
        expect(out.strategies[0].live?.since).toBe('2026-09-21');
    });

    it('leaves the SPY leg empty rather than inventing it, and never writes -0', () => {
        const out = shapeQuantLeaderboard([leaderboardRow('golden-cross', {live: liveRecord({benchmarkReturnPct: null, totalReturnPct: -0.001, maxDrawdownPct: null})})]);
        expect(out.strategies[0].live).toMatchObject({returnPct: 0, spyReturnPct: null, vsSpyPct: null, maxDrawdownPct: null});
        expect(Object.is(out.strategies[0].live?.returnPct, -0)).toBe(false);
    });

    it('says so when nothing has started, and once when some holdings are at cost', () => {
        const pending = shapeQuantLeaderboard(STRATEGIES.map((d) => leaderboardRow(d.id, {live: null, simulated: null})));
        expect(pending.strategies.every((s) => s.live === null && s.simulated === null)).toBe(true);
        expect(pending.notes).toEqual([QUANT_NOTES.noneStarted]);

        const atCost = shapeQuantLeaderboard([
            leaderboardRow('golden-cross', {live: liveRecord({unpriced: 2})}),
            leaderboardRow('low-volatility', {live: liveRecord({unpriced: 4})}),
        ]);
        expect(atCost.strategies[0].live?.unpricedHoldings).toBe(2);
        expect(atCost.notes).toEqual([QUANT_NOTES.unpriced]);
    });

    it('carries no beginner line and no sparkline', () => {
        const text = JSON.stringify(shapeQuantLeaderboard(STRATEGIES.map((d) => leaderboardRow(d.id))));
        for (const d of STRATEGIES) expect(text).not.toContain(d.explainer.beginnerLine);
        expect(text).not.toContain('spark');
    });
});

describe('shapeQuantStrategy', () => {
    it("decodes each order's reason clause by clause with the strategy's own definition", () => {
        const out = shapeQuantStrategy({def: GC, row: leaderboardRow('golden-cross'), run: run()});
        expect(out.strategy).toMatchObject({slug: 'golden-cross', name: 'Golden Cross Sectors', slots: 11, live: {returnPct: 1.23}});
        const [buy, sell] = out.latestRun?.orders ?? [];
        expect(buy).toMatchObject({side: 'buy', symbol: 'XLF', quantity: 213, kind: 'enter', filled: true, price: 42.35, reason: GOLDEN_CROSS});
        expect(buy.decoded.unrecognised).toEqual([]);
        expect(buy.decoded.clauses.map((c) => c.text)).toEqual(['enter', 'SMA50 42.10 > SMA200 40.00', '(+5.3%)']);
        expect(buy.decoded.clauses[1]).toMatchObject({term: GLOSSARY['trend-on'].term, definition: GLOSSARY['trend-on'].short});
        // The gloss quotes the rule's own slot count.
        expect(buy.decoded.clauses[0].gloss).toContain('11 equal slots');
        expect(sell).toMatchObject({side: 'sell', symbol: 'XLE', filled: false, price: null, unfilledBecause: 'no fresh quote'});
        expect(sell.decoded.clauses[0].text).toBe('exit');
        expect(out.latestRun?.skipped).toEqual([{symbol: 'XLRE', reason: 'below one share', decoded: expect.objectContaining({unrecognised: []})}]);
        expect(out.notes).toEqual([]);
    });

    it('hands back a reason it cannot decode, clipped', () => {
        const odd = run({orders: [{symbol: 'XLF', side: 'buy', quantity: 1, kind: 'enter', reason: `bought on a hunch ${'x'.repeat(600)}`, executed: true, price: 40, message: null}]});
        const [order] = shapeQuantStrategy({def: GC, row: null, run: odd}).latestRun?.orders ?? [];
        expect(order.decoded.clauses).toEqual([]);
        expect(order.decoded.unrecognised[0].length).toBeLessThanOrEqual(200);
        expect(order.reason.length).toBeLessThanOrEqual(200);
    });

    it('shows the top rows of the board in its own order, with column names and percentages', () => {
        const out = shapeQuantStrategy({def: GC, row: leaderboardRow('golden-cross'), run: run()});
        const watching = out.latestRun?.watching;
        expect(watching?.totalRows).toBe(BOARD.length);
        expect(watching?.rows.map((r) => r.symbol)).toEqual(sortBoard(BOARD).slice(0, QUANT_LIMITS.boardRows).map((r) => r.symbol));
        expect(watching?.rows[0]).toEqual({
            symbol: 'XLF',
            state: 'enter',
            values: {'Last close': 42.1, SMA50: 42.1, SMA200: 40, 'SMA50 vs SMA200 (%)': 5.25, 'Trend on': true},
        });
        expect(watching?.columns).toEqual(GC.signalColumns.map((c) => ({
            label: c.format === 'pct' ? `${c.label} (%)` : c.label,
            definition: c.help,
        })));
        const reading = narrateBoard(GC, {board: BOARD});
        expect(watching?.reading).toEqual({symbol: reading?.symbol, state: reading?.state, lines: reading?.lines, otherRows: reading?.key});
    });

    // A note is written by no one rule, so only the definition passed in can name the
    // indicator a "needs N bars" note waits on (and the slots a "no open slot" note counts).
    it("decodes a watched row's note with the strategy's own definition", () => {
        const noted = run({board: [row('XLP', 'excluded', {close: null, sma50: null, sma200: null, spread: null, trendOn: null}, 'needs 200 bars')]});
        const [only] = shapeQuantStrategy({def: GC, row: null, run: noted}).latestRun?.watching.rows ?? [];
        expect(only.note?.text).toBe('needs 200 bars');
        expect(only.note?.decoded.clauses[0]).toMatchObject({text: 'needs 200 bars', term: GLOSSARY.sma200.term});
        // Every column is empty on that board, so none is listed.
        expect(only.values).toEqual({});

        const full = run({board: [cross('XLY', 'watch', 50, 48, 'signal, but no open slot')]});
        const [waiting] = shapeQuantStrategy({def: GC, row: null, run: full}).latestRun?.watching.rows ?? [];
        expect(waiting.note?.decoded.clauses[0].gloss).toContain('all 11 slots');
    });

    it('caps orders, skipped orders and data issues, and counts what it cut', () => {
        const many = run({
            orders: Array.from({length: QUANT_LIMITS.orders + 4}, (_, i) => ({
                symbol: `S${i}`, side: 'buy' as const, quantity: 1, kind: 'enter' as const, reason: 'cash floor', executed: true, price: 1, message: null,
            })),
            skippedOrders: Array.from({length: QUANT_LIMITS.skipped + 3}, (_, i) => ({symbol: `K${i}`, reason: 'cash floor'})),
            dataIssues: Array.from({length: QUANT_LIMITS.issues + 2}, () => 'XLK: held but left the universe; kept'),
        });
        const latest = shapeQuantStrategy({def: GC, row: null, run: many}).latestRun;
        expect(latest?.orders).toHaveLength(QUANT_LIMITS.orders);
        expect(latest?.ordersTotal).toBe(QUANT_LIMITS.orders + 4);
        expect(latest?.skipped).toHaveLength(QUANT_LIMITS.skipped);
        expect(latest?.dataIssues).toHaveLength(QUANT_LIMITS.issues);
        expect(latest?.dataIssues[0].decoded.clauses.length).toBeGreaterThan(0);
    });

    it('says what is missing: no live record, no run, a quiet day, a skipped day, a preview', () => {
        const fresh = shapeQuantStrategy({def: GC, row: leaderboardRow('golden-cross', {live: null}), run: null});
        expect(fresh.latestRun).toBeNull();
        expect(fresh.notes).toEqual([QUANT_NOTES.notStarted, QUANT_NOTES.noRun]);

        const quiet = shapeQuantStrategy({def: GC, row: leaderboardRow('golden-cross'), run: run({orders: [], skippedOrders: []})});
        expect(quiet.notes).toEqual([QUANT_NOTES.noOrders]);

        const skipped = shapeQuantStrategy({def: GC, row: leaderboardRow('golden-cross'), run: run({
            mode: 'skipped', status: 'skipped', orders: [], board: [], dataIssues: ['9/11 symbols stale: XLB, XLC'],
        })});
        expect(skipped.notes).toEqual([QUANT_NOTES.skipped]);
        expect(skipped.latestRun?.watching).toMatchObject({rows: [], totalRows: 0, columns: [], reading: null});
        expect(skipped.latestRun?.dataIssues[0].decoded.clauses[0].text).toBe('9/11 symbols stale');

        const preview = shapeQuantStrategy({def: GC, row: leaderboardRow('golden-cross'), run: run({mode: 'preview', status: 'planned'})});
        expect(preview.notes).toEqual([QUANT_NOTES.preview]);
    });

    it('builds the strategy from the catalog when the leaderboard has no row for it', () => {
        const out = shapeQuantStrategy({def: def('rsi2-mean-reversion'), row: null, run: null});
        expect(out.strategy).toEqual({
            slug: 'rsi2-mean-reversion', name: 'RSI-2 Mean Reversion', family: 'Mean reversion', cadence: 'daily',
            followed: false, live: null, simulated: null, slots: 5,
        });
    });
});

describe('shapeUnknownStrategy', () => {
    it('names the eight and echoes what was asked, cleaned and clipped', () => {
        const out = shapeUnknownStrategy(`covered\ncalls${'y'.repeat(200)}`);
        expect(out.strategy).toBeNull();
        expect(out.known).toEqual(STRATEGIES.map((d) => ({slug: d.id, name: d.name})));
        expect(out.asked.startsWith('covered calls')).toBe(true);
        expect(out.asked.length).toBeLessThanOrEqual(60);
        expect(out.notes).toEqual([QUANT_NOTES.unknown]);
    });
});

describe('quant strategies — every shape', () => {
    const shapes = () => [
        shapeQuantLeaderboard(STRATEGIES.map((d) => leaderboardRow(d.id))),
        shapeQuantLeaderboard([]),
        shapeQuantStrategy({def: GC, row: leaderboardRow('golden-cross'), run: run()}),
        shapeQuantStrategy({def: GC, row: null, run: null}),
        shapeUnknownStrategy('zorblax'),
    ];

    it('carries one constant stance line', () => {
        for (const out of shapes()) expect(out.stance).toBe(QUANT_STANCE);
    });

    it('is plain JSON', () => {
        for (const out of shapes()) expect(JSON.parse(JSON.stringify(out))).toEqual(out);
    });

    it('keeps the stance line and every note descriptive', () => {
        for (const text of [QUANT_STANCE, ...Object.values(QUANT_NOTES)]) {
            expect(findBanned(text, 'copy'), text).toEqual([]);
        }
    });
});
