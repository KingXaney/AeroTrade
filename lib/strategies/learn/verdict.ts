// Guess the Verdict: the rows a reader is asked to call, and the stored answer for
// each. Nothing is recomputed — the answer key is StrategyRun.board[].state and the
// explanation is the order's own reason (enter/exit), the board note, or the fixed
// meaning of the state.

import type {RowState, SignalRow} from "@/lib/strategies/types";
import {STATE_MEANING} from "@/lib/learn/copy/verdict";

export const QUIZ_ROWS = 5;

// Acted-on rows first (the interesting calls), then watches the rule left a note on,
// then holdings, then plain watches; never 'excluded'. Symbol order inside a bucket
// keeps the pick deterministic for a given board.
const bucket = (row: SignalRow): number => {
    if (row.state === 'enter' || row.state === 'exit') return 0;
    if (row.state === 'watch' && row.note) return 1;
    if (row.state === 'held') return 2;
    return 3;
};

export const pickQuizRows = (board: readonly SignalRow[], n = QUIZ_ROWS): SignalRow[] =>
    board
        .filter((row) => row.state !== 'excluded')
        .sort((a, b) => bucket(a) - bucket(b) || a.symbol.localeCompare(b.symbol))
        .slice(0, n);

type VerdictAnswer = {answer: RowState; explanation: string};

type OrderLike = {symbol: string; side: 'buy' | 'sell'; reason: string};

export const explainVerdict = (row: SignalRow, run: {orders: readonly OrderLike[]}): VerdictAnswer => {
    if (row.state === 'enter' || row.state === 'exit') {
        const side = row.state === 'enter' ? 'buy' : 'sell';
        const order = run.orders.find((o) => o.symbol === row.symbol && o.side === side);
        if (order) return {answer: row.state, explanation: order.reason};
    }
    return {answer: row.state, explanation: row.note ?? STATE_MEANING[row.state]};
};
