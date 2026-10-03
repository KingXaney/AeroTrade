// All-in equity between two hands or ranges, on a board of 0, 3, 4 or 5 cards. Pure: the worker,
// the page-thread fallback and the tests run it alike.
//
// The planner picks one of three methods:
//   table        preflop, both ranges whole classes: exact and instant from the committed table
//   exact        every remaining board, when that is at most EXACT_BUDGET hand evaluations
//   monte-carlo  seeded samples in fixed blocks, so the same seed gives the same figure anywhere
//
// A job is a generator that yields progress and returns the result, so the worker and the
// page-thread fallback drive it alike. A stopped Monte Carlo run keeps its last estimate; a stopped
// enumeration has none, since the boards come in card order and a prefix of them is not a sample.

import {CARDS, CLASS_OF_COMBO, CLASSES, COMBO_HI, COMBO_LO, COMBOS} from "@/lib/poker/cards";
import {evaluateMasks} from "@/lib/poker/evaluator";
import {isClassUniform, type Range} from "@/lib/poker/range";
import {createShowdown, orderShowdown, sweepShowdown, type ShowdownHands} from "@/lib/poker/showdown";
import {mulberry32} from "@/lib/random";
import type {PreflopTable} from "@/lib/poker/preflop";

export const EXACT_BUDGET = 40_000_000;
export const MC_BLOCK = 65_536;
export const MC_MAX_SAMPLES = 20_000_000;
export const MC_TARGET_SE = 0.0005;
// The most hand values an enumeration works through between two yields.
const YIELD_WORK = 50_000;

export type EquityMethod = 'table' | 'exact' | 'monte-carlo';

export type EquityInput = {
    ranges: readonly [Range, Range];
    board: readonly number[];
    dead: readonly number[];
    method: 'auto' | 'exact' | 'monte-carlo';
    seed: number;
};

export type EquityIssue = 'board-size' | 'duplicate' | 'empty-side' | 'no-pairs';

// `equity` is a running estimate only for Monte Carlo.
export type EquityProgress = {done: number; total: number; equity: number | null; stdErr: number | null};

export type EquityResult = {
    method: EquityMethod;
    // Side A's equity, win and tie shares; side B's equity is 1 − equity. The table keeps equity only.
    equity: number;
    win: number | null;
    tie: number | null;
    stdErr: number | null;
    boards: number;
    samples: number;
    // Side A's equity by starting-hand class; null where side A holds none of it.
    byClass: (number | null)[];
};

const choose = (n: number, k: number): number => {
    if (k < 0 || k > n) return 0;
    let out = 1;
    for (let i = 0; i < k; i++) out = (out * (n - i)) / (i + 1);
    return Math.round(out);
};

const shares = (x: number, y: number): boolean =>
    COMBO_HI[x] === COMBO_HI[y] || COMBO_HI[x] === COMBO_LO[y] || COMBO_LO[x] === COMBO_HI[y] || COMBO_LO[x] === COMBO_LO[y];

const deadOf = (input: EquityInput): Uint8Array => {
    const dead = new Uint8Array(CARDS);
    for (const card of [...input.board, ...input.dead]) if (card >= 0 && card < CARDS) dead[card] = 1;
    return dead;
};

const liveCombos = (range: Range, dead: Uint8Array): number[] => {
    const out: number[] = [];
    for (let combo = 0; combo < COMBOS; combo++) if (range[combo] > 0 && !dead[COMBO_HI[combo]] && !dead[COMBO_LO[combo]]) out.push(combo);
    return out;
};

export const validateEquity = (input: EquityInput): EquityIssue[] => {
    const issues: EquityIssue[] = [];
    if (![0, 3, 4, 5].includes(input.board.length)) issues.push('board-size');
    const cards = [...input.board, ...input.dead];
    if (new Set(cards).size !== cards.length || cards.some((c) => !Number.isInteger(c) || c < 0 || c >= CARDS)) issues.push('duplicate');
    const dead = deadOf(input);
    const a = liveCombos(input.ranges[0], dead);
    const b = liveCombos(input.ranges[1], dead);
    if (a.length === 0 || b.length === 0) issues.push('empty-side');
    else if (!a.some((x) => b.some((y) => !shares(x, y)))) issues.push('no-pairs');
    return issues;
};

// Each side's live combos and the deck the board is finished from. A side down to one hand holds
// those two cards before the board is dealt, so they leave the deck and the other side; two passes
// settle it, since the second side can only come down to one hand because of the first.
type Sides = {a: number[]; b: number[]; deck: number[]};

const sidesOf = (input: EquityInput): Sides => {
    const dead = deadOf(input);
    let a = liveCombos(input.ranges[0], dead);
    let b = liveCombos(input.ranges[1], dead);
    for (let pass = 0; pass < 2; pass++) {
        const fixedA = a.length === 1 ? a[0] : -1;
        const fixedB = b.length === 1 ? b[0] : -1;
        if (fixedB >= 0) a = a.filter((combo) => !shares(combo, fixedB));
        if (fixedA >= 0) b = b.filter((combo) => !shares(combo, fixedA));
    }
    const out = new Uint8Array(dead);
    for (const side of [a, b]) {
        if (side.length !== 1) continue;
        out[COMBO_HI[side[0]]] = 1;
        out[COMBO_LO[side[0]]] = 1;
    }
    const deck: number[] = [];
    for (let card = 0; card < CARDS; card++) if (!out[card]) deck.push(card);
    return {a, b, deck};
};

export type EquityPlan = {method: EquityMethod; boards: number; live: [number, number]; work: number};

// `tableLoaded`: whether the preflop table can answer — the page plans without loading it.
export const planEquity = (input: EquityInput, tableLoaded: boolean): EquityPlan => {
    const {a, b, deck} = sidesOf(input);
    const boards = choose(deck.length, 5 - input.board.length);
    const live: [number, number] = [a.length, b.length];
    const work = boards * (a.length + b.length);
    const tableFits = tableLoaded && input.board.length === 0 && input.dead.length === 0 && isClassUniform(input.ranges[0]) && isClassUniform(input.ranges[1]);
    const method: EquityMethod = input.method !== 'auto' ? input.method : tableFits ? 'table' : work <= EXACT_BUDGET ? 'exact' : 'monte-carlo';
    return {method, boards, live, work};
};

const classShares = (combos: readonly number[], won: Float64Array, met: Float64Array): (number | null)[] => {
    const num = new Float64Array(CLASSES);
    const den = new Float64Array(CLASSES);
    combos.forEach((combo, i) => {
        num[CLASS_OF_COMBO[combo]] += won[i];
        den[CLASS_OF_COMBO[combo]] += met[i];
    });
    return Array.from(num, (n, id) => (den[id] > 0 ? n / den[id] : null));
};

// ---- the preflop table --------------------------------------------------------------------------

const weightByClass = (range: Range): Float64Array => {
    const out = new Float64Array(CLASSES);
    for (let combo = 0; combo < COMBOS; combo++) out[CLASS_OF_COMBO[combo]] = range[combo];
    return out;
};

function* tableJob(input: EquityInput, table: PreflopTable): Generator<EquityProgress, EquityResult> {
    const wa = weightByClass(input.ranges[0]);
    const wb = weightByClass(input.ranges[1]);
    let num = 0;
    let den = 0;
    const byClass = new Array<number | null>(CLASSES).fill(null);
    for (let i = 0; i < CLASSES; i++) {
        if (wa[i] === 0) continue;
        let n = 0;
        let d = 0;
        for (let j = 0; j < CLASSES; j++) {
            if (wb[j] === 0) continue;
            const pairs = table.pairs[i * CLASSES + j] * wb[j];
            n += pairs * table.equity(i, j);
            d += pairs;
        }
        if (d > 0) byClass[i] = n / d;
        num += wa[i] * n;
        den += wa[i] * d;
    }
    yield {done: 1, total: 1, equity: null, stdErr: null};
    return {method: 'table', equity: num / den, win: null, tie: null, stdErr: null, boards: 0, samples: 0, byClass};
}

// ---- exact enumeration ----------------------------------------------------------------------------

const handsOf = (combos: readonly number[]): ShowdownHands => ({
    count: combos.length,
    hi: Uint8Array.from(combos, (combo) => COMBO_HI[combo]),
    lo: Uint8Array.from(combos, (combo) => COMBO_LO[combo]),
    values: new Int32Array(combos.length),
});

// Four 13-bit suit masks per hand, side by side.
const handMasks = (hands: ShowdownHands): Int32Array => {
    const masks = new Int32Array(hands.count * 4);
    for (let i = 0; i < hands.count; i++) {
        masks[i * 4 + (hands.hi[i] & 3)] |= 1 << (hands.hi[i] >> 2);
        masks[i * 4 + (hands.lo[i] & 3)] |= 1 << (hands.lo[i] >> 2);
    }
    return masks;
};

const scoreHands = (hands: ShowdownHands, masks: Int32Array, onBoard: Uint8Array, s0: number, s1: number, s2: number, s3: number) => {
    for (let i = 0; i < hands.count; i++) {
        const m = i * 4;
        hands.values[i] = onBoard[hands.hi[i]] || onBoard[hands.lo[i]] ? -1 : evaluateMasks(s0 | masks[m], s1 | masks[m + 1], s2 | masks[m + 2], s3 | masks[m + 3]);
    }
};

function* exactJob(input: EquityInput): Generator<EquityProgress, EquityResult> {
    const {a: combosA, b: combosB, deck} = sidesOf(input);
    const a = handsOf(combosA);
    const b = handsOf(combosB);
    const masksA = handMasks(a);
    const masksB = handMasks(b);
    const weightA = Float64Array.from(combosA, (combo) => input.ranges[0][combo]);
    const weightB = Float64Array.from(combosB, (combo) => input.ranges[1][combo]);
    const show = createShowdown(a, b);
    const win = new Float64Array(a.count);
    const tie = new Float64Array(a.count);
    const total = new Float64Array(a.count);
    // Per A hand over every board, weighed by its own weight: equity won and weight met.
    const wonA = new Float64Array(a.count);
    const metA = new Float64Array(a.count);
    const base = [0, 0, 0, 0];
    for (const card of input.board) base[card & 3] |= 1 << (card >> 2);
    const onBoard = new Uint8Array(CARDS);
    const need = 5 - input.board.length;
    const totalBoards = choose(deck.length, need);
    // A step is at most a 200th of the boards and at most YIELD_WORK hand values, so even two
    // full ranges preflop hand control back within a few milliseconds.
    const every = Math.max(1, Math.min(Math.floor(totalBoards / 200), Math.floor(YIELD_WORK / (a.count + b.count))));
    let winSum = 0;
    let tieSum = 0;
    let weightSum = 0;
    let boards = 0;

    const idx = new Int32Array(need);
    for (let k = 0; k < need; k++) idx[k] = k;
    for (;;) {
        let s0 = base[0];
        let s1 = base[1];
        let s2 = base[2];
        let s3 = base[3];
        for (let k = 0; k < need; k++) {
            const card = deck[idx[k]];
            onBoard[card] = 1;
            const bit = 1 << (card >> 2);
            switch (card & 3) {
                case 0: s0 |= bit; break;
                case 1: s1 |= bit; break;
                case 2: s2 |= bit; break;
                default: s3 |= bit;
            }
        }
        scoreHands(a, masksA, onBoard, s0, s1, s2, s3);
        scoreHands(b, masksB, onBoard, s0, s1, s2, s3);
        for (let k = 0; k < need; k++) onBoard[deck[idx[k]]] = 0;
        orderShowdown(show);
        sweepShowdown(show, weightB, win, tie, total);
        for (let i = 0; i < a.count; i++) {
            if (total[i] === 0) continue;
            const w = weightA[i];
            wonA[i] += w * (win[i] + tie[i] / 2);
            metA[i] += w * total[i];
            winSum += w * win[i];
            tieSum += w * tie[i];
            weightSum += w * total[i];
        }
        boards++;
        if (boards % every === 0 && boards < totalBoards) yield {done: boards, total: totalBoards, equity: null, stdErr: null};
        // The next board, in order of deck positions.
        let k = need - 1;
        while (k >= 0 && idx[k] === deck.length - need + k) k--;
        if (k < 0) break;
        idx[k]++;
        for (let r = k + 1; r < need; r++) idx[r] = idx[r - 1] + 1;
    }
    return {
        method: 'exact', equity: (winSum + tieSum / 2) / weightSum, win: winSum / weightSum, tie: tieSum / weightSum,
        stdErr: null, boards, samples: 0, byClass: classShares(combosA, wonA, metA),
    };
}

// ---- Monte Carlo ----------------------------------------------------------------------------------

const cumulative = (weights: Float64Array): Float64Array => {
    const out = new Float64Array(weights.length);
    let sum = 0;
    for (let i = 0; i < weights.length; i++) out[i] = sum += weights[i];
    return out;
};

const drawIndex = (cdf: Float64Array, u: number): number => {
    const target = u * cdf[cdf.length - 1];
    let lo = 0;
    let hi = cdf.length - 1;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cdf[mid] > target) hi = mid;
        else lo = mid + 1;
    }
    return lo;
};

function* monteCarloJob(input: EquityInput): Generator<EquityProgress, EquityResult> {
    const {a: combosA, b: combosB, deck} = sidesOf(input);
    const a = handsOf(combosA);
    const b = handsOf(combosB);
    const masksA = handMasks(a);
    const masksB = handMasks(b);
    const cdfA = cumulative(Float64Array.from(combosA, (combo) => input.ranges[0][combo]));
    const cdfB = cumulative(Float64Array.from(combosB, (combo) => input.ranges[1][combo]));
    const random = mulberry32(input.seed >>> 0);
    const used = new Int32Array(CARDS);
    let stamp = 0;
    const base = [0, 0, 0, 0];
    for (const card of input.board) base[card & 3] |= 1 << (card >> 2);
    const need = 5 - input.board.length;
    const won = new Float64Array(a.count);
    const met = new Float64Array(a.count);
    let samples = 0;
    let sum = 0;
    let sumSq = 0;
    let wins = 0;
    let ties = 0;
    for (;;) {
        for (let s = 0; s < MC_BLOCK; s++) {
            // A deal is a pair of hands drawn by weight, redrawn while they share a card.
            let i = 0;
            let j = 0;
            do {
                i = drawIndex(cdfA, random());
                j = drawIndex(cdfB, random());
            } while (a.hi[i] === b.hi[j] || a.hi[i] === b.lo[j] || a.lo[i] === b.hi[j] || a.lo[i] === b.lo[j]);
            stamp++;
            used[a.hi[i]] = used[a.lo[i]] = used[b.hi[j]] = used[b.lo[j]] = stamp;
            let s0 = base[0];
            let s1 = base[1];
            let s2 = base[2];
            let s3 = base[3];
            for (let k = 0; k < need; k++) {
                let card = 0;
                do card = deck[Math.floor(random() * deck.length)]; while (used[card] === stamp);
                used[card] = stamp;
                const bit = 1 << (card >> 2);
                switch (card & 3) {
                    case 0: s0 |= bit; break;
                    case 1: s1 |= bit; break;
                    case 2: s2 |= bit; break;
                    default: s3 |= bit;
                }
            }
            const ma = i * 4;
            const mb = j * 4;
            const va = evaluateMasks(s0 | masksA[ma], s1 | masksA[ma + 1], s2 | masksA[ma + 2], s3 | masksA[ma + 3]);
            const vb = evaluateMasks(s0 | masksB[mb], s1 | masksB[mb + 1], s2 | masksB[mb + 2], s3 | masksB[mb + 3]);
            const x = va > vb ? 1 : va === vb ? 0.5 : 0;
            if (x === 1) wins++;
            else if (x === 0.5) ties++;
            sum += x;
            sumSq += x * x;
            won[i] += x;
            met[i] += 1;
        }
        samples += MC_BLOCK;
        const mean = sum / samples;
        const variance = Math.max(sumSq / samples - mean * mean, 0);
        const stdErr = Math.sqrt(variance / (samples - 1));
        if (stdErr <= MC_TARGET_SE || samples >= MC_MAX_SAMPLES) {
            return {
                method: 'monte-carlo', equity: mean, win: wins / samples, tie: ties / samples, stdErr,
                boards: 0, samples, byClass: classShares(combosA, won, met),
            };
        }
        // The samples the target error needs at this variance, in whole blocks.
        const needed = Math.ceil(variance / (MC_TARGET_SE * MC_TARGET_SE) / MC_BLOCK) * MC_BLOCK;
        yield {done: samples, total: Math.min(MC_MAX_SAMPLES, Math.max(samples + MC_BLOCK, needed)), equity: mean, stdErr};
    }
}

export function* equityJob(input: EquityInput, table: PreflopTable | null): Generator<EquityProgress, EquityResult> {
    const issues = validateEquity(input);
    if (issues.length > 0) throw new Error(`equity: ${issues.join(', ')}`);
    const plan = planEquity(input, table !== null);
    if (plan.method === 'table' && table) return yield* tableJob(input, table);
    if (plan.method === 'exact') return yield* exactJob(input);
    return yield* monteCarloJob(input);
}

export const runToEnd = <T, R>(job: Generator<T, R>): R => {
    for (;;) {
        const step = job.next();
        if (step.done) return step.value;
    }
};
