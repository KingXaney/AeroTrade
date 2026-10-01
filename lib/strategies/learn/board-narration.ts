// "Read this board": the signal board's top row — the one the board lists first, by the
// shared order in lib/strategies/views.ts — read in plain words by a narrator per strategy,
// then one line on how every other row on that board reads. A narrator takes its numbers
// from row.values, formatted exactly as the board prints them, and its thresholds from the
// catalog's parameters (findParam) and slot count, so changing a parameter moves the prose
// with it. The reading ends on the stored verdict: a narrator compares the stored numbers
// with the parameters to say why, and never decides the verdict itself.
//
// Pure and client-safe, and it never throws: a row that lacks the numbers its rule reads
// (a stray holding, a stale symbol, a board written under other columns) or a definition
// missing a parameter falls back to the row's decoded note or the fixed meaning of its
// verdict. Copy lives in lib/learn/copy/board.ts.

import {BOARD_COPY} from '@/lib/learn/copy/board';
import {shareText} from '@/lib/learn/copy/reasons';
import {STATE_MEANING} from '@/lib/learn/copy/verdict';
import {decodeReason} from '@/lib/learn/reasons';
import {CASH_FLOOR} from '@/lib/strategies/config';
import {findParam} from '@/lib/strategies/params';
import type {RowState, SignalRow, StrategyDefinition, StrategyId} from '@/lib/strategies/types';
import {formatSignalValue, sortBoard, STATE_LABEL} from '@/lib/strategies/views';

export type BoardReading = {
    symbol: string;
    state: RowState;
    // The row read in plain words: what its numbers say, then the verdict they led to.
    lines: string[];
    // How every other row on this board reads, in the rule's own parameters.
    key: string;
};

type Values = SignalRow['values'];

const num = (values: Values, key: string): number | null => {
    const value = values[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

const bool = (values: Values, key: string): boolean | null => {
    const value = values[key];
    return typeof value === 'boolean' ? value : null;
};

// Formatted the way the board's cells print them, so a sentence quotes its cell.
const price = (value: number): string => formatSignalValue(value, 'price');
const signed = (fraction: number): string => formatSignalValue(fraction, 'pct');
const reading = (value: number): string => formatSignalValue(value, 'number');
// A weight, a volatility, a gap: a magnitude, not a change.
const magnitude = (fraction: number): string => `${Math.abs(fraction * 100).toFixed(1)}%`;

// A whole number of sessions or bars, as the rule reads it.
const whole = (def: StrategyDefinition, key: string): string | null => {
    const value = findParam(def, key);
    return value === null ? null : String(value);
};

type Narrate = (def: StrategyDefinition, row: SignalRow, board: readonly SignalRow[]) => string[] | null;
type Key = (def: StrategyDefinition) => string | null;

const INVESTED = shareText(1 - CASH_FLOOR);
const band = (def: StrategyDefinition): string => shareText(def.driftBand);

// ---- Buy & Hold SPY ----------------------------------------------------------------------

const buyAndHold: Narrate = (def, row) => {
    const close = num(row.values, 'close');
    if (close === null) return null;
    const allocation = findParam(def, 'allocation');
    const sinceEntry = num(row.values, 'sinceEntry');
    const lines = [BOARD_COPY.bhClose(row.symbol, price(close))];
    if (sinceEntry !== null) lines.push(BOARD_COPY.bhSinceEntry(row.symbol, signed(sinceEntry)));
    switch (row.state) {
        case 'held': return [...lines, BOARD_COPY.bhHeld(row.symbol)];
        case 'enter': return [...lines, BOARD_COPY.bhEnter(row.symbol, allocation === null ? INVESTED : shareText(allocation))];
        case 'watch': return [...lines, BOARD_COPY.bhWatch(row.symbol)];
        default: return null;
    }
};

// ---- 60/40 -------------------------------------------------------------------------------

const sixtyForty: Narrate = (def, row) => {
    const target = num(row.values, 'target');
    if (target === null) return null;
    const weight = num(row.values, 'weight');
    const drift = num(row.values, 'drift') ?? (weight === null ? null : weight - target);
    const lines: string[] = [];
    if (weight === null || drift === null) {
        lines.push(BOARD_COPY.legUnpriced(row.symbol, magnitude(target)));
    } else {
        lines.push(BOARD_COPY.legWeight(row.symbol, magnitude(weight), magnitude(target), signed(drift)));
        if (row.state === 'held') {
            lines.push(Math.abs(drift) > def.driftBand ? BOARD_COPY.legOutsideBand(band(def)) : BOARD_COPY.legInsideBand(band(def)));
        }
    }
    switch (row.state) {
        case 'held': return [...lines, BOARD_COPY.legHeld(row.symbol)];
        case 'enter': return [...lines, BOARD_COPY.legEnter(row.symbol)];
        case 'watch': return [...lines, BOARD_COPY.legWatch(row.symbol)];
        default: return null;
    }
};

// ---- Golden cross ------------------------------------------------------------------------

const LEVEL = 0.0005;

const goldenCross: Narrate = (def, row) => {
    const fast = whole(def, 'fast');
    const slow = whole(def, 'slow');
    const fastAvg = num(row.values, 'sma50');
    const slowAvg = num(row.values, 'sma200');
    if (fast === null || slow === null || fastAvg === null || slowAvg === null) return null;
    const trendOn = bool(row.values, 'trendOn') ?? fastAvg > slowAvg;
    const spread = num(row.values, 'spread');
    const lines = [trendOn
        ? BOARD_COPY.crossOn(row.symbol, `${fast}-day`, price(fastAvg), `${slow}-day`, price(slowAvg))
        : BOARD_COPY.crossOff(row.symbol, `${fast}-day`, price(fastAvg), `${slow}-day`, price(slowAvg))];
    if (spread !== null) {
        lines.push(Math.abs(spread) < LEVEL ? BOARD_COPY.crossLevel() : BOARD_COPY.crossSpread(magnitude(spread), spread > 0));
    }
    switch (row.state) {
        case 'enter': return [...lines, BOARD_COPY.crossEnter(row.symbol, def.slots)];
        case 'held': return [...lines, BOARD_COPY.crossHeld(row.symbol)];
        case 'exit': return [...lines, BOARD_COPY.crossExit(row.symbol)];
        case 'watch': return [...lines, BOARD_COPY.crossWatch(row.symbol)];
        default: return null;
    }
};

// ---- Dual momentum -----------------------------------------------------------------------

const STOCK_TEST = 'SPY';
const HURDLE_FUND = 'BIL';
const BOND_FUND = 'AGG';

const dualMomentum: Narrate = (def, row) => {
    const sessions = whole(def, 'lookback');
    // A blank return is the rule's own reading (not enough history yet); a missing key is
    // a board written under other columns.
    if (sessions === null || !('r12' in row.values)) return null;
    const r12 = num(row.values, 'r12');
    const lines = [r12 === null ? BOARD_COPY.gemNoReturn(row.symbol, sessions) : BOARD_COPY.gemReturn(row.symbol, signed(r12), sessions)];
    if (row.symbol === HURDLE_FUND) {
        lines.push(BOARD_COPY.gemHurdle(row.symbol));
    } else {
        const above = bool(row.values, 'aboveHurdle');
        if (row.symbol === STOCK_TEST && above !== null) lines.push(above ? BOARD_COPY.gemSpyOn() : BOARD_COPY.gemSpyOff(BOND_FUND));
        const pick = bool(row.values, 'pick');
        if (pick !== null) lines.push(pick ? BOARD_COPY.gemPicked(row.symbol) : BOARD_COPY.gemNotPicked());
    }
    switch (row.state) {
        case 'enter': return [...lines, BOARD_COPY.gemEnter(row.symbol, INVESTED)];
        case 'held': return [...lines, BOARD_COPY.gemHeld(row.symbol)];
        case 'exit': return [...lines, BOARD_COPY.gemExit(row.symbol)];
        case 'watch': return [...lines, BOARD_COPY.gemWatch(row.symbol)];
        default: return null;
    }
};

// ---- Ranked reshuffles (12-1 momentum, low volatility) -------------------------------------

// The board's own count of ranked rows; a single row read alone has no total to quote.
const rankTotal = (board: readonly SignalRow[], position: number): string | null => {
    const total = board.filter((r) => num(r.values, 'rank') !== null).length;
    return total >= position ? String(total) : null;
};

const rankedVerdict = (row: SignalRow, position: number, slots: number): string | null => {
    const inside = position <= slots;
    switch (row.state) {
        case 'enter': return BOARD_COPY.rankedEnter(row.symbol, slots);
        case 'held': return inside ? BOARD_COPY.rankedHeldInside(row.symbol, slots) : BOARD_COPY.rankedHeldOutside(row.symbol, slots);
        case 'exit': return BOARD_COPY.rankedExit(row.symbol, slots);
        case 'watch': return inside ? BOARD_COPY.rankedWatchInside(row.symbol, slots) : BOARD_COPY.rankedWatchOutside(row.symbol, slots);
        default: return null;
    }
};

const momentum: Narrate = (def, row, board) => {
    const lookback = whole(def, 'lookback');
    const skip = whole(def, 'skip');
    const score = num(row.values, 'momentum');
    const position = num(row.values, 'rank');
    if (lookback === null || skip === null || score === null || position === null) return null;
    const verdict = rankedVerdict(row, position, def.slots);
    if (verdict === null) return null;
    return [
        BOARD_COPY.momentumReading(row.symbol, signed(score), lookback, skip),
        BOARD_COPY.rankPosition(String(position), rankTotal(board, position), 'strongest'),
        verdict,
    ];
};

const lowVolatility: Narrate = (def, row, board) => {
    const days = whole(def, 'volWindow');
    const vol = num(row.values, 'vol63');
    const position = num(row.values, 'rank');
    if (days === null || vol === null || position === null) return null;
    const verdict = rankedVerdict(row, position, def.slots);
    if (verdict === null) return null;
    return [
        BOARD_COPY.lowVolReading(row.symbol, days, magnitude(vol)),
        BOARD_COPY.rankPosition(String(position), rankTotal(board, position), 'calmest'),
        verdict,
    ];
};

// ---- RSI-2 mean reversion ----------------------------------------------------------------

const rsi2: Narrate = (def, row) => {
    const period = whole(def, 'rsiPeriod');
    const level = findParam(def, 'entryRsi');
    const exitLength = whole(def, 'exitSma');
    const trendLength = whole(def, 'trendSma');
    const close = num(row.values, 'close');
    if (period === null || level === null || exitLength === null || trendLength === null || close === null) return null;

    if (row.state === 'held' || row.state === 'exit') {
        const exitAvg = num(row.values, 'sma5');
        if (exitAvg === null) return null;
        return [row.state === 'held'
            ? BOARD_COPY.rsiHeld(row.symbol, price(close), exitLength, price(exitAvg))
            : BOARD_COPY.rsiExit(row.symbol, price(close), exitLength, price(exitAvg))];
    }

    const rsi = num(row.values, 'rsi2');
    const trendAvg = num(row.values, 'sma200');
    if (rsi === null || trendAvg === null) return null;
    const dip = rsi < level;
    const uptrend = close > trendAvg;
    const lines = [
        dip ? BOARD_COPY.rsiDip(row.symbol, period, reading(rsi), String(level)) : BOARD_COPY.rsiNoDip(row.symbol, period, reading(rsi), String(level)),
        uptrend ? BOARD_COPY.rsiTrendUp(price(close), trendLength, price(trendAvg)) : BOARD_COPY.rsiTrendDown(price(close), trendLength, price(trendAvg)),
    ];
    switch (row.state) {
        case 'enter': return [...lines, BOARD_COPY.rsiEnter(def.slots, exitLength)];
        case 'watch': return [...lines, dip && uptrend ? BOARD_COPY.rsiNoSlot(def.slots) : BOARD_COPY.rsiWatch()];
        default: return null;
    }
};

// ---- Donchian breakout -------------------------------------------------------------------

const donchian: Narrate = (def, row) => {
    const entryDays = whole(def, 'entryChannel');
    const exitDays = whole(def, 'exitChannel');
    const close = num(row.values, 'close');
    if (entryDays === null || exitDays === null || close === null) return null;

    if (row.state === 'held' || row.state === 'exit') {
        const low = num(row.values, 'low20');
        if (low === null) return null;
        return [row.state === 'held'
            ? BOARD_COPY.channelHeld(row.symbol, price(close), exitDays, price(low))
            : BOARD_COPY.channelExit(row.symbol, price(close), exitDays, price(low))];
    }

    const high = num(row.values, 'high55');
    if (high === null) return null;
    const broke = close > high;
    const size = num(row.values, 'vsHigh') ?? (high > 0 ? close / high - 1 : 0);
    const lines = [broke
        ? BOARD_COPY.breakout(row.symbol, price(close), entryDays, price(high), magnitude(size))
        : BOARD_COPY.noBreakout(row.symbol, price(close), entryDays, price(high))];
    switch (row.state) {
        case 'enter': return [...lines, BOARD_COPY.breakoutEnter(def.slots, exitDays)];
        case 'watch': return [...lines, broke ? BOARD_COPY.breakoutNoSlot(def.slots) : BOARD_COPY.breakoutWatch()];
        default: return null;
    }
};

// ---- How every other row reads ---------------------------------------------------------------

const KEYS: Record<StrategyId, Key> = {
    'buy-and-hold-spy': () => BOARD_COPY.bhKey(),
    'sixty-forty': (def) => {
        const spy = findParam(def, 'spyWeight');
        const agg = findParam(def, 'aggWeight');
        const invested = 1 - CASH_FLOOR;
        const targets = spy === null || agg === null ? null : {spy: shareText(spy * invested), agg: shareText(agg * invested)};
        return BOARD_COPY.sixtyFortyKey(targets, band(def));
    },
    'golden-cross': (def) => {
        const fast = whole(def, 'fast');
        const slow = whole(def, 'slow');
        return fast === null || slow === null ? null : BOARD_COPY.crossKey(`${fast}-day`, `${slow}-day`);
    },
    'dual-momentum': () => BOARD_COPY.gemKey(),
    'momentum-12-1': (def) => BOARD_COPY.momentumKey(def.slots),
    'rsi2-mean-reversion': (def) => {
        const period = whole(def, 'rsiPeriod');
        const level = findParam(def, 'entryRsi');
        const trendLength = whole(def, 'trendSma');
        const exitLength = whole(def, 'exitSma');
        return period === null || level === null || trendLength === null || exitLength === null
            ? null
            : BOARD_COPY.rsiKey(period, String(level), trendLength, exitLength);
    },
    'donchian-breakout': (def) => {
        const entryDays = whole(def, 'entryChannel');
        const exitDays = whole(def, 'exitChannel');
        return entryDays === null || exitDays === null ? null : BOARD_COPY.breakoutKey(entryDays, exitDays);
    },
    'low-volatility': (def) => BOARD_COPY.lowVolKey(def.slots),
};

const NARRATORS: Record<StrategyId, Narrate> = {
    'buy-and-hold-spy': buyAndHold,
    'sixty-forty': sixtyForty,
    'golden-cross': goldenCross,
    'dual-momentum': dualMomentum,
    'momentum-12-1': momentum,
    'rsi2-mean-reversion': rsi2,
    'donchian-breakout': donchian,
    'low-volatility': lowVolatility,
};

// ---- Reading a row -------------------------------------------------------------------------

// What a row says when its rule's own reading is not possible: its note decoded (a stale
// bar, missing history, a stray holding), else the fixed meaning of its verdict.
const fallback = (def: StrategyDefinition, row: SignalRow): string[] => {
    const label = STATE_LABEL[row.state];
    const notes = row.note ? decodeReason(row.note, {def}).clauses.map((clause) => clause.gloss) : [];
    if (notes.length > 0) return [...notes, BOARD_COPY.boardVerdict(row.symbol, label)];
    if (row.state === 'excluded') return [BOARD_COPY.verdictOnly(row.symbol, label, STATE_MEANING.excluded)];
    return [BOARD_COPY.numbersMissing(row.symbol), BOARD_COPY.verdictOnly(row.symbol, label, STATE_MEANING[row.state])];
};

// A row with nothing in any column (a stray holding) has only its note to go on.
const blank = (row: SignalRow): boolean => Object.values(row.values).every((value) => value === null || value === undefined);

// `board` is the board the row sits on; the ranked rules quote their total from it.
export const readBoardRow = (def: StrategyDefinition, row: SignalRow, board: readonly SignalRow[] = [row]): BoardReading => {
    const lines = row.state === 'excluded' || blank(row) ? null : NARRATORS[def.id](def, row, board);
    return {
        symbol: row.symbol,
        state: row.state,
        lines: lines ?? fallback(def, row),
        key: KEYS[def.id](def) ?? BOARD_COPY.genericKey,
    };
};

// The row the board lists first. Null when there is no board to read.
export const narrateBoard = (def: StrategyDefinition, run: {board: readonly SignalRow[]} | null): BoardReading | null => {
    if (!run || run.board.length === 0) return null;
    const [top] = sortBoard(run.board);
    return readBoardRow(def, top, run.board);
};
