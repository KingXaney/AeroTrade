// What the sprint learns about one reader: per kind of problem (lib/games/arithmetic-cells), how
// many were answered, how long they took in all and how many full wrong entries came first. The
// page folds a round's timed answers into it; the server keeps one aggregate per reader and
// adds each kept round to it. "Slow" is measured against the reader's own average over every
// kind, never against anyone else. Pure and client-safe.

import {type CellId, isCellId, MAX_FOCUS} from "@/lib/games/arithmetic-cells";
import {cellOf} from "@/lib/games/arithmetic-cells";
import type {Problem} from "@/lib/games/arithmetic";

export type CellStat = {n: number; ms: number; slips: number};
export type SkillCells = Partial<Record<CellId, CellStat>>;

// One answered problem as the round records it: what it was, how long it took from being shown,
// and how many full wrong entries preceded the right one.
export type Solved = {problem: Problem; ms: number; slips: number};

// A kind counts once it has this many answers, and reads as slow at this share over the average.
export const MIN_ATTEMPTS = 5;
export const WEAK_RATIO = 1.1;
export const WEAK_TOP = 3;

export const foldSolved = (cells: SkillCells, solved: readonly Solved[]): SkillCells => {
    const out: SkillCells = {...cells};
    for (const {problem, ms, slips} of solved) {
        const cell = cellOf(problem);
        const stat = out[cell] ?? {n: 0, ms: 0, slips: 0};
        out[cell] = {n: stat.n + 1, ms: stat.ms + ms, slips: stat.slips + slips};
    }
    return out;
};

export const overallMeanMs = (cells: SkillCells): number | null => {
    let n = 0;
    let ms = 0;
    for (const stat of Object.values(cells)) {
        if (!stat) continue;
        n += stat.n;
        ms += stat.ms;
    }
    return n > 0 ? ms / n : null;
};

export type WeakCell = {cell: CellId; n: number; meanMs: number; ratio: number; slips: number};

// The kinds that take the reader longest: at least MIN_ATTEMPTS answers, a mean at least
// WEAK_RATIO times the reader's overall mean, the slowest first, at most WEAK_TOP of them.
export const weakCells = (cells: SkillCells): WeakCell[] => {
    const overall = overallMeanMs(cells);
    if (overall === null || overall <= 0) return [];
    const rows: WeakCell[] = [];
    for (const [cell, stat] of Object.entries(cells) as [CellId, CellStat | undefined][]) {
        if (!stat || stat.n < MIN_ATTEMPTS) continue;
        const meanMs = stat.ms / stat.n;
        const ratio = meanMs / overall;
        if (ratio >= WEAK_RATIO) rows.push({cell, n: stat.n, meanMs, ratio, slips: stat.slips});
    }
    return rows.sort((a, b) => b.ratio - a.ratio || a.cell.localeCompare(b.cell)).slice(0, WEAK_TOP);
};

export type SkillDocLike = {cells: SkillCells; problems: number; rounds: number; since: Date | string};

export type SkillView = {weak: WeakCell[]; problems: number; rounds: number; since: string | null; mostTried: number};

export const skillView = (doc: SkillDocLike | null): SkillView => {
    if (!doc) return {weak: [], problems: 0, rounds: 0, since: null, mostTried: 0};
    const mostTried = Math.max(0, ...Object.values(doc.cells).map((stat) => stat?.n ?? 0));
    const since = typeof doc.since === 'string' ? doc.since.slice(0, 10) : doc.since.toISOString().slice(0, 10);
    return {weak: weakCells(doc.cells), problems: doc.problems, rounds: doc.rounds, since, mostTried};
};

export const practiceHref = (cells: readonly CellId[]): string => `/games/arithmetic?mode=practice&focus=${cells.join(',')}`;

// The ?focus= of a practice address: known cells, each once, at most MAX_FOCUS, in the order given.
export const parseFocus = (raw: string | undefined): CellId[] => {
    const out: CellId[] = [];
    for (const part of String(raw ?? '').split(',')) {
        const cell = part.trim();
        if (isCellId(cell) && !out.includes(cell)) out.push(cell);
        if (out.length >= MAX_FOCUS) break;
    }
    return out;
};
