import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import type {SignalRow} from '@/lib/strategies/types';
import {ASKABLE_STATES, STATE_MEANING, VERDICT_QUIZ_COPY} from '@/lib/learn/copy/verdict';
import {explainVerdict, pickQuizRows, QUIZ_ROWS} from '@/lib/strategies/learn/verdict';

const row = (symbol: string, state: SignalRow['state'], note?: string): SignalRow =>
    ({symbol, state, values: {close: 100}, ...(note ? {note} : {})});

const board: SignalRow[] = [
    row('XLU', 'watch'),
    row('XLP', 'excluded', 'needs 200 bars'),
    row('XLK', 'held'),
    row('XLF', 'enter'),
    row('XLB', 'watch', 'signal, but no open slot'),
    row('XLE', 'exit'),
    row('XLV', 'held'),
    row('XLI', 'watch'),
];

const run = {orders: [
    {symbol: 'XLF', side: 'buy' as const, reason: 'enter: SMA50 42.10 > SMA200 40.00 (+5.3%)'},
    {symbol: 'XLE', side: 'sell' as const, reason: 'exit: SMA50 80.00 ≤ SMA200 81.00'},
]};

describe('pickQuizRows', () => {
    it('asks about acted-on rows first, never about excluded ones, and caps the count', () => {
        const picked = pickQuizRows(board).map((r) => r.symbol);
        expect(picked).toEqual(['XLE', 'XLF', 'XLB', 'XLK', 'XLV']);
        expect(picked).toHaveLength(QUIZ_ROWS);
        expect(picked).not.toContain('XLP');
        expect(pickQuizRows(board, 2).map((r) => r.symbol)).toEqual(['XLE', 'XLF']);
    });

    it('is deterministic for a given board', () => {
        expect(pickQuizRows([...board].reverse())).toEqual(pickQuizRows(board));
    });
});

describe('explainVerdict', () => {
    it('quotes the order reason for an entry or exit', () => {
        expect(explainVerdict(row('XLF', 'enter'), run)).toEqual({answer: 'enter', explanation: run.orders[0].reason});
        expect(explainVerdict(row('XLE', 'exit'), run)).toEqual({answer: 'exit', explanation: run.orders[1].reason});
    });

    it('quotes the board note, then the fixed meaning', () => {
        expect(explainVerdict(row('XLB', 'watch', 'signal, but no open slot'), run).explanation).toBe('signal, but no open slot');
        expect(explainVerdict(row('XLK', 'held'), run).explanation).toBe(STATE_MEANING.held);
        expect(explainVerdict(row('XLZ', 'enter'), {orders: []}).explanation).toBe(STATE_MEANING.enter);
    });
});

describe('copy', () => {
    it('describes each verdict and asks only about decisions', () => {
        for (const [state, text] of Object.entries(STATE_MEANING)) {
            expect(findBanned(text, 'copy'), state).toEqual([]);
        }
        expect(ASKABLE_STATES).not.toContain('excluded');
        expect(findBanned([VERDICT_QUIZ_COPY.summary, VERDICT_QUIZ_COPY.intro, VERDICT_QUIZ_COPY.tally(1, 3)].join(' '), 'copy')).toEqual([]);
    });
});
