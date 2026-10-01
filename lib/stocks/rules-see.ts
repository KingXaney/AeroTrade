// "What the rules see" on the stock page: for each strategy that watches a symbol, the row it
// stored for that symbol on its latest board — verdict and values formatted exactly as the
// strategy's own signal board prints them, and read in plain words by that rule's narrator
// (lib/strategies/learn/board-narration.ts). Pure and client-safe; the read is
// lib/strategies/page-store.ts getBoardRowsForSymbol.
//
// Invariant 8 in practice: the run's dates, and any value every row prints the same (the
// close, when the rows share a run date), are stated once for the panel instead of on each
// row; a column a row leaves blank is not shown for that row; the strategies with no stored
// row are named once, in one line.

import {readBoardRow} from '@/lib/strategies/learn/board-narration';
import type {GlossaryKey} from '@/lib/learn/glossary';
import type {RowState, SignalColumn, SignalRow, StrategyDefinition, StrategyId} from '@/lib/strategies/types';
import {formatSignalValue, visibleSignalColumns} from '@/lib/strategies/views';

// One watching strategy's latest stored run, projected to this symbol's row (null when that
// run's board has no row for it).
export type SymbolBoardRead = {strategyId: StrategyId; date: string; asOf: string; row: SignalRow | null};

type RulesSeeStamp = {asOf: string; date: string};
export type RulesSeeCell = {column: SignalColumn; value: string};

type RulesSeeEntry = {
    strategyId: StrategyId;
    name: string;
    state: RowState;
    note: string | null;
    // Null when the panel states the dates once for every row.
    stamp: RulesSeeStamp | null;
    cells: RulesSeeCell[];
    reading: string[];
};

export type RulesSeeView = {
    symbol: string;
    watching: number;
    stamp: RulesSeeStamp | null;
    shared: RulesSeeCell[];
    entries: RulesSeeEntry[];
    missing: string[];
    // The definitions the panel's one disclosure lists: every column it shows, once.
    glossary: GlossaryKey[];
};

type Found = {def: StrategyDefinition; read: SymbolBoardRead; row: SignalRow; cells: RulesSeeCell[]};

const cellsFor = (def: StrategyDefinition, row: SignalRow): RulesSeeCell[] =>
    visibleSignalColumns(def.signalColumns, [row]).map((column) => ({column, value: formatSignalValue(row.values[column.key], column.format)}));

// A cell every row prints identically — same key, label and printed value.
const sharedCells = (found: readonly Found[]): RulesSeeCell[] => {
    if (found.length < 2) return [];
    const [first, ...rest] = found;
    return first.cells.filter((cell) => rest.every((other) => other.cells.some((c) =>
        c.column.key === cell.column.key && c.column.label === cell.column.label && c.value === cell.value)));
};

export const buildRulesSee = (
    symbol: string,
    watching: readonly StrategyDefinition[],
    reads: readonly SymbolBoardRead[],
): RulesSeeView | null => {
    if (watching.length === 0) return null;
    const wanted = symbol.trim().toUpperCase();
    const readById = new Map(reads.map((r) => [r.strategyId, r]));
    const found: Found[] = [];
    const missing: string[] = [];
    for (const def of watching) {
        const read = readById.get(def.id);
        const row = read?.row;
        if (!read || !row || row.symbol.toUpperCase() !== wanted) {
            missing.push(def.name);
            continue;
        }
        found.push({def, read, row, cells: cellsFor(def, row)});
    }

    const sameRun = found.length > 0 && found.every((f) => f.read.asOf === found[0].read.asOf && f.read.date === found[0].read.date);
    const stamp = sameRun ? {asOf: found[0].read.asOf, date: found[0].read.date} : null;
    const shared = sameRun ? sharedCells(found) : [];
    const sharedKeys = new Set(shared.map((cell) => cell.column.key));

    const entries: RulesSeeEntry[] = found.map(({def, read, row, cells}) => ({
        strategyId: def.id,
        name: def.name,
        state: row.state,
        note: row.note ?? null,
        stamp: stamp ? null : {asOf: read.asOf, date: read.date},
        cells: cells.filter((cell) => !sharedKeys.has(cell.column.key)),
        reading: readBoardRow(def, row).lines,
    }));

    const glossary = Array.from(new Set(
        [...shared, ...entries.flatMap((e) => e.cells)].flatMap((cell) => (cell.column.glossary ? [cell.column.glossary] : [])),
    ));

    return {symbol: wanted, watching: watching.length, stamp, shared, entries, missing, glossary};
};
