// "Read this board": the top row of a strategy's signal board, read in plain words by a
// per-strategy narrator that takes its numbers from row.values and its thresholds from the
// catalog's parameters, plus one line on how every other row reads. Held to the boards the
// rules really publish (every rule's generic and branch-forcing contexts, the fixtures
// rules.test.ts and the reason decoder share) and to hand-built rows for each verdict.
// Every sentence is learner copy, so it is checked at the 'copy' tier of lib/learn/banned.ts.

import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {BOARD_COPY} from '@/lib/learn/copy/board';
import {STATE_MEANING} from '@/lib/learn/copy/verdict';
import {narrateBoard, readBoardRow, type BoardReading} from '@/lib/strategies/learn/board-narration';
import {STRATEGIES} from '@/lib/strategies/catalog';
import {STRATEGY_RULES} from '@/lib/strategies/rules';
import {sortBoard} from '@/lib/strategies/views';
import type {RowState, SignalRow, StrategyDefinition, StrategyId} from '@/lib/strategies/types';
import {branchContexts, definition, genericContext} from '@/lib/strategies/__tests__/fixtures';

const sentences = (reading: BoardReading): string[] => [...reading.lines, reading.key];
const textOf = (reading: BoardReading): string => sentences(reading).join(' ');

const expectClean = (reading: BoardReading, context: string) => {
    expect(reading.lines.length, context).toBeGreaterThan(0);
    for (const sentence of sentences(reading)) {
        expect(sentence.endsWith('.'), `${context}: ${sentence}`).toBe(true);
        expect(sentence, context).not.toMatch(/undefined|NaN|null|\[object/);
        expect(findBanned(sentence, 'copy'), `${context}: ${sentence}`).toEqual([]);
    }
};

const row = (symbol: string, state: RowState, values: SignalRow['values'], note?: string): SignalRow =>
    ({symbol, state, values, ...(note ? {note} : {})});

const withParams = (id: StrategyId, patch: Partial<StrategyDefinition>): StrategyDefinition => {
    const def = definition(id);
    return {...def, ...patch, params: {...def.params, ...(patch.params ?? {})}};
};

// ---------------------------------------------------------------------------

describe('narrateBoard', () => {
    const gc = definition('golden-cross');
    // The golden-cross board qa-learn seeds.
    const cross = (symbol: string, state: RowState, sma50: number, sma200: number, note?: string): SignalRow =>
        row(symbol, state, {close: sma50, sma50, sma200, spread: sma50 / sma200 - 1, trendOn: sma50 > sma200}, note);
    const board = [
        cross('XLK', 'held', 210.5, 198.2),
        cross('XLF', 'enter', 42.1, 40),
        cross('XLE', 'exit', 80, 81),
        cross('XLU', 'watch', 70, 72),
        cross('XLP', 'excluded', 0, 0, 'needs 200 bars'),
    ];

    it('reads the row the board shows first', () => {
        const reading = narrateBoard(gc, {board});
        expect(reading?.symbol).toBe(sortBoard(board)[0].symbol);
        expect(reading?.symbol).toBe('XLF');
        expect(reading?.state).toBe('enter');
        expect(narrateBoard(gc, {board: [...board].reverse()})).toEqual(reading);
    });

    it('says nothing about a board that is not there', () => {
        expect(narrateBoard(gc, null)).toBeNull();
        expect(narrateBoard(gc, {board: []})).toBeNull();
    });

    it('reads the numbers as the board prints them, then the verdict they led to', () => {
        const reading = narrateBoard(gc, {board});
        if (!reading) throw new Error('no reading');
        expectClean(reading, 'golden-cross XLF');
        const text = reading.lines.join(' ');
        expect(text).toContain('XLF');
        expect(text).toContain('$42.10');
        expect(text).toContain('$40.00');
        expect(text).toMatch(/50-day average \(\$42\.10\) is above its 200-day average \(\$40\.00\)/);
        expect(text).toContain('Trend on reads yes');
        // The spread as the board's cell prints it (+5.2%), not as the order reason rounded it.
        expect(text).toContain('5.2% above');
        expect(text).toMatch(/verdict is enter/);
        expect(text).toContain('one of its 11 equal slots');
        expect(reading.key).toMatch(/50-day average is above the 200-day average/);
    });

    it('reads each verdict on the board in its own words', () => {
        const byState = Object.fromEntries(board.map((r) => [r.state, textOf(readBoardRow(gc, r, board))]));
        expect(byState.exit).toMatch(/at or below its 200-day average \(\$81\.00\)/);
        expect(byState.exit).toMatch(/Trend on reads no/);
        expect(byState.exit).toMatch(/verdict is exit/);
        expect(byState.held).toMatch(/already owns XLK/);
        expect(byState.watch).toMatch(/verdict is watch/);
        expect(byState.excluded).toContain('needs 200 daily bars');
        expect(byState.excluded).toMatch(/XLP/);
        for (const r of board) expectClean(readBoardRow(gc, r, board), `golden-cross ${r.symbol}`);
    });
});

// ---------------------------------------------------------------------------

describe('every row the rules publish', () => {
    const cases = STRATEGIES.flatMap((def) => [genericContext(def), ...branchContexts(def)].flatMap((ctx) => {
        const {board} = STRATEGY_RULES[def.id](def, ctx);
        return board.map((r) => ({def, row: r, board}));
    }));

    it('reads cleanly, names the symbol, and uses the rule\'s own reading wherever the numbers are there', () => {
        expect(cases.length).toBeGreaterThan(0);
        for (const {def, row: r, board} of cases) {
            const context = `${def.id} ${r.symbol} ${r.state}${r.note ? ` (${r.note})` : ''}`;
            const reading = readBoardRow(def, r, board);
            expectClean(reading, context);
            expect(reading.symbol).toBe(r.symbol);
            expect(reading.state).toBe(r.state);
            expect(reading.lines.join(' '), context).toContain(r.symbol);
            if (r.state !== 'excluded' && r.note !== 'left the universe') {
                expect(textOf(reading), context).not.toContain(BOARD_COPY.numbersMissing(r.symbol));
            }
        }
    });

    it('reaches every verdict each rule can publish', () => {
        const reached = new Set(cases.map(({def, row: r}) => `${def.id}:${r.state}`));
        for (const pair of [
            'golden-cross:enter', 'golden-cross:held', 'golden-cross:exit', 'golden-cross:watch', 'golden-cross:excluded',
            'rsi2-mean-reversion:enter', 'rsi2-mean-reversion:held', 'rsi2-mean-reversion:exit', 'rsi2-mean-reversion:watch',
            'donchian-breakout:enter', 'donchian-breakout:held', 'donchian-breakout:exit', 'donchian-breakout:watch',
            'momentum-12-1:enter', 'momentum-12-1:held', 'momentum-12-1:exit', 'momentum-12-1:watch',
            'low-volatility:enter', 'low-volatility:held', 'low-volatility:exit', 'low-volatility:watch',
            'dual-momentum:enter', 'dual-momentum:held', 'dual-momentum:exit', 'dual-momentum:watch',
            'sixty-forty:enter', 'sixty-forty:held', 'buy-and-hold-spy:enter', 'buy-and-hold-spy:excluded',
        ]) {
            expect(reached.has(pair), pair).toBe(true);
        }
    });

    it('gives every strategy a line on how the other rows read', () => {
        for (const def of STRATEGIES) {
            const reading = readBoardRow(def, row('SPY', 'watch', {close: 100}));
            expect(reading.key.length).toBeGreaterThan(0);
            expect(findBanned(reading.key, 'copy'), def.id).toEqual([]);
            expect(reading.key, def.id).not.toBe(BOARD_COPY.genericKey);
        }
    });
});

// ---------------------------------------------------------------------------

describe('each narrator', () => {
    it('RSI-2 reads the dip, the trend filter and the exit in the rule\'s own numbers', () => {
        const def = definition('rsi2-mean-reversion');
        const enter = textOf(readBoardRow(def, row('AAPL', 'enter', {close: 123.45, rsi2: 3.4, sma5: 126.1, sma200: 110, aboveSma200: true})));
        expect(enter).toContain('2-day RSI reads 3.4, under the entry level of 10');
        expect(enter).toMatch(/close \(\$123\.45\) is above the 200-day average \(\$110\.00\)/);
        expect(enter).toContain('one of 5 equal slots');
        expect(enter).toContain('first close above the 5-day average');
        const noSlot = textOf(readBoardRow(def, row('MSFT', 'watch', {close: 410, rsi2: 6.2, sma5: 415, sma200: 380, aboveSma200: true}, 'signal, but no open slot')));
        expect(noSlot).toMatch(/all 5 slots are taken/);
        const noDip = textOf(readBoardRow(def, row('KO', 'watch', {close: 60, rsi2: 55, sma5: 59, sma200: 55, aboveSma200: true})));
        expect(noDip).toMatch(/55\.0, not under the entry level of 10/);
        expect(noDip).toMatch(/verdict is watch/);
        const downtrend = textOf(readBoardRow(def, row('PFE', 'watch', {close: 25, rsi2: 4, sma5: 26, sma200: 30, aboveSma200: false})));
        expect(downtrend).toMatch(/at or below the 200-day average \(\$30\.00\)/);
        const held = textOf(readBoardRow(def, row('V', 'held', {close: 250, rsi2: 20, sma5: 255, sma200: 240, aboveSma200: true})));
        expect(held).toMatch(/close \(\$250\.00\) is not above the 5-day average \(\$255\.00\)/);
        expect(held).toMatch(/verdict is held/);
        const exit = textOf(readBoardRow(def, row('V', 'exit', {close: 260, rsi2: 80, sma5: 255, sma200: 240, aboveSma200: true})));
        expect(exit).toMatch(/rose above the 5-day average \(\$255\.00\)/);
        expect(exit).toMatch(/verdict is exit/);
    });

    it('Donchian reads the breakout, the missing breakout and the channel exit', () => {
        const def = definition('donchian-breakout');
        const enter = textOf(readBoardRow(def, row('NVDA', 'enter', {close: 105.5, high55: 101, low20: 90, vsHigh: 0.0446})));
        expect(enter).toMatch(/closed at \$105\.50, above the highest high of the previous 55 sessions \(\$101\.00\), by 4\.5%/);
        expect(enter).toContain('one of 8 equal slots');
        expect(enter).toContain('20-day low');
        const watch = textOf(readBoardRow(def, row('KO', 'watch', {close: 99, high55: 101, low20: 90, vsHigh: -0.0198})));
        expect(watch).toMatch(/no breakout/);
        const full = textOf(readBoardRow(def, row('AMD', 'watch', {close: 120, high55: 110, low20: 95, vsHigh: 0.0909}, 'signal, but no open slot')));
        expect(full).toMatch(/all 8 slots are taken/);
        const held = textOf(readBoardRow(def, row('HD', 'held', {close: 300, high55: 320, low20: 280, vsHigh: -0.0625})));
        expect(held).toMatch(/lowest low of the previous 20 sessions \(\$280\.00\)/);
        expect(held).toMatch(/verdict is held/);
        const exit = textOf(readBoardRow(def, row('HD', 'exit', {close: 270, high55: 320, low20: 280, vsHigh: -0.156})));
        expect(exit).toMatch(/fell under the lowest low of the previous 20 sessions \(\$280\.00\)/);
    });

    it('the ranked rules read the rank against the slot count, and a total from the board', () => {
        const momentum = definition('momentum-12-1');
        const board = [
            row('NVDA', 'enter', {close: 100, momentum: 0.45, rank: 1}),
            row('AAPL', 'held', {close: 100, momentum: 0.02, rank: 12}),
            row('KO', 'watch', {close: 100, momentum: -0.05, rank: 30}),
        ];
        const enter = textOf(readBoardRow(momentum, board[0], board));
        expect(enter).toContain('from 252 sessions ago to 21 sessions ago is +45.0%');
        expect(enter).toContain('#1 of 3');
        expect(enter).toContain('top 8');
        expect(textOf(readBoardRow(momentum, board[1], board))).toMatch(/outside the top 8, but trades happen only at the monthly reshuffle/);
        expect(textOf(readBoardRow(momentum, board[1]))).toMatch(/ranks #12, where #1 is the strongest/);
        const lowVol = definition('low-volatility');
        const calm = textOf(readBoardRow(lowVol, row('KO', 'enter', {close: 60, vol63: 0.123, rank: 2})));
        expect(calm).toContain('annualise to 12.3% volatility');
        expect(calm).toContain('counting from the calmest');
        expect(calm).toContain('top 10');
    });

    it('dual momentum reads the hurdle on SPY, the pick, and the T-bill fund as the hurdle itself', () => {
        const def = definition('dual-momentum');
        const spy = textOf(readBoardRow(def, row('SPY', 'enter', {close: 500, r12: 0.182, aboveHurdle: true, pick: true})));
        expect(spy).toContain('last 252 sessions, dividends included, is +18.2%');
        expect(spy).toMatch(/absolute momentum reads on/);
        expect(spy).toMatch(/Would be chosen reads yes/);
        expect(spy).toContain('99% of the account');
        const off = textOf(readBoardRow(def, row('SPY', 'exit', {close: 500, r12: 0.01, aboveHurdle: false, pick: false})));
        expect(off).toMatch(/absolute momentum reads off/);
        expect(off).toMatch(/verdict is exit/);
        const bil = textOf(readBoardRow(def, row('BIL', 'watch', {close: 91, r12: 0.049, aboveHurdle: null, pick: false})));
        expect(bil).toMatch(/hurdle/);
        expect(bil).not.toMatch(/absolute momentum/);
        const young = textOf(readBoardRow(def, row('SPY', 'watch', {close: 500, r12: null, aboveHurdle: null, pick: null})));
        expect(young).toMatch(/cannot be computed yet/);
        expect(young).not.toContain(BOARD_COPY.numbersMissing('SPY'));
    });

    it('60/40 reads the drift against the band, and an unpriced leg honestly', () => {
        const def = definition('sixty-forty');
        const outside = textOf(readBoardRow(def, row('SPY', 'held', {close: 100, weight: 0.632, target: 0.594, drift: 0.038})));
        expect(outside).toContain('63.2% of the account against a target of 59.4%, a drift of +3.8%');
        expect(outside).toMatch(/wider than the 2% band/);
        const inside = textOf(readBoardRow(def, row('AGG', 'held', {close: 50, weight: 0.4, target: 0.396, drift: 0.004})));
        expect(inside).toMatch(/inside the 2% band/);
        const unpriced = textOf(readBoardRow(def, row('AGG', 'held', {close: 50, weight: null, target: 0.396, drift: null})));
        expect(unpriced).toMatch(/cannot be measured/);
        const enter = textOf(readBoardRow(def, row('AGG', 'enter', {close: 50, weight: 0, target: 0.396, drift: -0.396})));
        expect(enter).toMatch(/verdict is enter/);
        expect(readBoardRow(def, row('SPY', 'watch', {close: 100})).key).toContain('59.4% for SPY, 39.6% for AGG');
    });

    it('buy and hold reads the one purchase and the gain since', () => {
        const def = definition('buy-and-hold-spy');
        const held = textOf(readBoardRow(def, row('SPY', 'held', {close: 550, sinceEntry: 0.1})));
        expect(held).toContain('Since entry reads +10.0%');
        expect(held).toMatch(/verdict stays held/);
        const enter = textOf(readBoardRow(def, row('SPY', 'enter', {close: 500, sinceEntry: null})));
        expect(enter).toContain('99% of the account into SPY');
    });

    it('reads a stray holding and a stale row by their notes', () => {
        const def = definition('momentum-12-1');
        const stray = textOf(readBoardRow(def, row('ZZZ', 'held', {close: null, momentum: null, rank: null}, 'left the universe')));
        expect(stray).toMatch(/no longer on the strategy's list/);
        expect(stray).toContain('ZZZ');
        // Blank columns on a stray are not "not enough history" on a board that reads blanks that way.
        const gemStray = textOf(readBoardRow(definition('dual-momentum'), row('ZZZ', 'held', {close: null, r12: null, aboveHurdle: null, pick: null}, 'left the universe')));
        expect(gemStray).toMatch(/no longer on the strategy's list/);
        expect(gemStray).not.toMatch(/cannot be computed/);
        const stale = textOf(readBoardRow(def, row('AAPL', 'excluded', {close: null, momentum: null, rank: null}, 'stale: no bar for 2026-09-21')));
        expect(stale).toContain('no price bar for 2026-09-21');
    });
});

// ---------------------------------------------------------------------------

describe('the narration follows the definition', () => {
    // RSI 11: no dip at the catalog's entry level of 10, a dip at 12. The row is held fixed
    // so that only the parameter moves.
    const rsiRow = row('AAPL', 'watch', {close: 123.45, rsi2: 11, sma5: 126.1, sma200: 110, aboveSma200: true});

    it('moves with entryRsi', () => {
        const catalog = readBoardRow(definition('rsi2-mean-reversion'), rsiRow);
        expect(textOf(catalog)).toContain('not under the entry level of 10');
        expect(catalog.key).toContain('under 10');
        const mutated = readBoardRow(withParams('rsi2-mean-reversion', {params: {entryRsi: 12}}), rsiRow);
        expect(textOf(mutated)).toContain('under the entry level of 12');
        expect(textOf(mutated)).not.toContain('not under');
        expect(mutated.key).toContain('under 12');
        expectClean(mutated, 'entryRsi 12');
    });

    it('moves with the slot count, the exit average and the golden-cross averages', () => {
        const mutated = readBoardRow(withParams('rsi2-mean-reversion', {slots: 3, params: {exitSma: 7}}), {...rsiRow, state: 'enter', values: {...rsiRow.values, rsi2: 3.4}});
        expect(textOf(mutated)).toContain('one of 3 equal slots');
        expect(textOf(mutated)).toContain('7-day average');
        const cross = readBoardRow(withParams('golden-cross', {params: {fast: 20, slow: 100}}),
            row('XLK', 'held', {close: 210, sma50: 205, sma200: 198, spread: 0.035, trendOn: true}));
        expect(textOf(cross)).toContain('20-day average ($205.00) is above its 100-day average ($198.00)');
        expect(cross.key).toContain('20-day average is above the 100-day average');
    });

    it('falls back to the verdict alone when the row lacks the rule\'s numbers', () => {
        // qa-strategies seeds golden-cross values on the RSI-2 board.
        const def = definition('rsi2-mean-reversion');
        const reading = readBoardRow(def, row('SYM00', 'held', {close: 100, sma50: 205.1, sma200: 198.2, spread: 0.0348, trendOn: true}));
        expectClean(reading, 'mismatched values');
        expect(reading.lines[0]).toBe(BOARD_COPY.numbersMissing('SYM00'));
        expect(textOf(reading)).toContain(STATE_MEANING.held);
    });

    it('never throws on a definition missing its parameters', () => {
        const broken = {...definition('rsi2-mean-reversion'), params: {}};
        const reading = readBoardRow(broken, rsiRow);
        expectClean(reading, 'no params');
        expect(reading.key).toBe(BOARD_COPY.genericKey);
    });
});

// ---------------------------------------------------------------------------

describe('board copy', () => {
    it('describes without advising on the branches the rows above do not reach', () => {
        const texts = [
            BOARD_COPY.summary('XLF'), BOARD_COPY.genericKey,
            BOARD_COPY.numbersMissing('XLF'), BOARD_COPY.boardVerdict('XLF', 'held'),
            BOARD_COPY.verdictOnly('XLF', 'watch', STATE_MEANING.watch),
            BOARD_COPY.rankPosition('3', null, 'strongest'), BOARD_COPY.rankPosition('3', '40', 'calmest'),
            BOARD_COPY.crossLevel(), BOARD_COPY.bhWatch('SPY'), BOARD_COPY.gemWatch('EFA'),
            BOARD_COPY.sixtyFortyKey(null, '2%'), BOARD_COPY.legWatch('AGG'),
            // What each verdict means, quoted for a row whose numbers are missing.
            ...Object.values(STATE_MEANING),
        ];
        for (const text of texts) {
            expect(findBanned(text, 'copy'), text).toEqual([]);
            expect(text).not.toMatch(/undefined|NaN|null/);
        }
        expect(BOARD_COPY.summary('XLF')).toBe('Read this board — XLF');
    });
});
