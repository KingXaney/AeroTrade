// The river solver: a betting tree (lib/poker/river/tree) between two ranges on a five-card board,
// solved by discounted CFR (α 1.5, β 0, γ 2) or CFR+, with every walk vectorised over each side's
// live hands. A fold pays from per-card sums and a showdown from the sorted sweep
// (lib/poker/showdown), both with card removal, so each terminal costs O(n + 52). Pure.
//
// Utilities are zero-sum: at a terminal the winner gains half the starting pot plus what the loser
// put in on the river, and the loser loses as much; a hand's result in chips — what it takes from
// the pot less what it put in on the river — is its utility plus half the starting pot.
//
// Exploitability is what each player's counter-strategy that wins the most would gain against the
// other's average strategy, averaged over the two; the solve stops once it is under `targetPct` of
// the pot, or at `maxIterations`. A stopped solve keeps the average strategy so far.

import {CARDS, CLASS_OF_COMBO, CLASSES, COMBO_HI, COMBO_LO, COMBOS} from "@/lib/poker/cards";
import {evaluateMasks} from "@/lib/poker/evaluator";
import type {Range} from "@/lib/poker/range";
import {createShowdown, orderShowdown, sweepShowdown, type Showdown, type ShowdownHands} from "@/lib/poker/showdown";
import {buildTree, DECISION, estimateBytes, FOLD, RIVER_LIMITS, validateConfig, type RiverConfig, type RiverTree, type TreeIssue} from "@/lib/poker/river/tree";

export const RIVER_TARGET_PCT = 0.3;
export const RIVER_MAX_ITERATIONS = 1000;
const ALPHA = 1.5;
const BETA = 0;
const GAMMA = 2;

export type RiverMethod = 'dcfr' | 'cfr+';

export type RiverInput = {
    board: readonly number[];
    // [out of position, in position].
    ranges: readonly [Range, Range];
    config: RiverConfig;
    method: RiverMethod;
    maxIterations: number;
    targetPct: number;
    maxDecisions: number;
};

export type RiverIssue = TreeIssue | 'board' | 'empty-side' | 'no-pairs';

export type RiverProgress = {iterations: number; exploitabilityPct: number | null};

export type RiverResult = {
    method: RiverMethod;
    tree: RiverTree;
    // Each side's live combos (not on the board, weight above zero) and their weights.
    combos: [Int32Array, Int32Array];
    weights: [Float64Array, Float64Array];
    // Every decision's average strategy, action-major over its actor's hands.
    strategy: Float32Array;
    strategyOffsets: Int32Array;
    // Every decision's view: for each of the 169 classes, the actor's frequency of each action, the
    // combos of that class that reach it, and their average result (NaN when none reach).
    view: Float32Array;
    viewOffsets: Int32Array;
    // Each player's average result at the root, in chips.
    ev: [number, number];
    exploitability: number;
    exploitabilityPct: number;
    history: {iterations: number; pct: number}[];
    iterations: number;
};

type Game = {
    tree: RiverTree;
    combos: [Int32Array, Int32Array];
    weights: [Float64Array, Float64Array];
    hands: [ShowdownHands, ShowdownHands];
    // shows[p]: side p's hands against the other side's.
    shows: [Showdown, Showdown];
    n: [number, number];
    halfPot: number;
    // The weight of every pair of hands that share no card.
    pairs: number;
};

const liveCombos = (range: Range, board: readonly number[]): number[] => {
    const dead = new Uint8Array(CARDS);
    for (const card of board) dead[card] = 1;
    const out: number[] = [];
    for (let combo = 0; combo < COMBOS; combo++) if (range[combo] > 0 && !dead[COMBO_HI[combo]] && !dead[COMBO_LO[combo]]) out.push(combo);
    return out;
};

const handsOn = (combos: Int32Array, board: readonly number[]): ShowdownHands => {
    const masks = [0, 0, 0, 0];
    for (const card of board) masks[card & 3] |= 1 << (card >> 2);
    const hi = Uint8Array.from(combos, (combo) => COMBO_HI[combo]);
    const lo = Uint8Array.from(combos, (combo) => COMBO_LO[combo]);
    const values = new Int32Array(combos.length);
    for (let i = 0; i < combos.length; i++) {
        const m = [...masks];
        m[hi[i] & 3] |= 1 << (hi[i] >> 2);
        m[lo[i] & 3] |= 1 << (lo[i] >> 2);
        values[i] = evaluateMasks(m[0], m[1], m[2], m[3]);
    }
    return {count: combos.length, hi, lo, values};
};

const disjoint = (a: number, b: number) =>
    COMBO_HI[a] !== COMBO_HI[b] && COMBO_HI[a] !== COMBO_LO[b] && COMBO_LO[a] !== COMBO_HI[b] && COMBO_LO[a] !== COMBO_LO[b];

export const validateRiver = (input: RiverInput): RiverIssue[] => {
    const issues: RiverIssue[] = validateConfig(input.config);
    const {board} = input;
    if (board.length !== 5 || new Set(board).size !== 5 || board.some((card) => !Number.isInteger(card) || card < 0 || card >= CARDS)) issues.push('board');
    if (issues.length > 0) return issues;
    const a = liveCombos(input.ranges[0], board);
    const b = liveCombos(input.ranges[1], board);
    if (a.length === 0 || b.length === 0) return ['empty-side'];
    if (!a.some((x) => b.some((y) => disjoint(x, y)))) return ['no-pairs'];
    const tree = buildTree(input.config, input.maxDecisions);
    if (!tree || estimateBytes(tree, [a.length, b.length]) > RIVER_LIMITS.maxBytes) return ['too-big'];
    return [];
};

const setUp = (input: RiverInput, tree: RiverTree): Game => {
    const combos: [Int32Array, Int32Array] = [Int32Array.from(liveCombos(input.ranges[0], input.board)), Int32Array.from(liveCombos(input.ranges[1], input.board))];
    const weights: [Float64Array, Float64Array] = [
        Float64Array.from(combos[0], (combo) => input.ranges[0][combo]),
        Float64Array.from(combos[1], (combo) => input.ranges[1][combo]),
    ];
    const hands: [ShowdownHands, ShowdownHands] = [handsOn(combos[0], input.board), handsOn(combos[1], input.board)];
    const shows: [Showdown, Showdown] = [createShowdown(hands[0], hands[1]), createShowdown(hands[1], hands[0])];
    orderShowdown(shows[0]);
    orderShowdown(shows[1]);
    const game: Game = {tree, combos, weights, hands, shows, n: [combos[0].length, combos[1].length], halfPot: input.config.pot / 2, pairs: 0};
    const mass = new Float64Array(game.n[0]);
    blockedMass(game, 0, weights[1], mass, new Float64Array(52));
    game.pairs = mass.reduce((sum, m, i) => sum + m * weights[0][i], 0);
    return game;
};

// For each of side p's hands, the weight in `reach` (the other side's) of the hands it shares no
// card with: everything, less the hands holding either card, plus its own copy, taken off twice.
const blockedMass = (game: Game, p: 0 | 1, reach: Float64Array, out: Float64Array, sums: Float64Array) => {
    const q = p === 0 ? 1 : 0;
    const mine = game.hands[p];
    const theirs = game.hands[q];
    const same = game.shows[p].same;
    sums.fill(0);
    let all = 0;
    for (let j = 0; j < game.n[q]; j++) {
        const w = reach[j];
        all += w;
        sums[theirs.hi[j]] += w;
        sums[theirs.lo[j]] += w;
    }
    for (let i = 0; i < game.n[p]; i++) {
        const j = same[i];
        out[i] = all - sums[mine.hi[i]] - sums[mine.lo[i]] + (j >= 0 ? reach[j] : 0);
    }
};

type Level = {
    strategy: Float64Array;
    outs: Float64Array[];
    next: Float64Array;
};

type Solver = {
    game: Game;
    method: RiverMethod;
    regrets: Float64Array[];
    sums: Float64Array[];
    levels: Level[];
    win: Float64Array;
    tie: Float64Array;
    total: Float64Array;
    mass: Float64Array;
    cardSums: Float64Array;
};

const createSolver = (game: Game, method: RiverMethod): Solver => {
    const {tree} = game;
    const regrets: Float64Array[] = [];
    const sums: Float64Array[] = [];
    for (let node = 0; node < tree.size; node++) {
        if (tree.kind[node] !== DECISION) continue;
        const cells = tree.childCount[node] * game.n[tree.player[node]];
        regrets[tree.decisionOf[node]] = new Float64Array(cells);
        sums[tree.decisionOf[node]] = new Float64Array(cells);
    }
    const widest = Math.max(game.n[0], game.n[1]);
    const levels: Level[] = Array.from({length: tree.maxDepth + 1}, () => ({
        strategy: new Float64Array(tree.maxActions * widest),
        outs: Array.from({length: tree.maxActions}, () => new Float64Array(widest)),
        next: new Float64Array(widest),
    }));
    return {
        game, method, regrets, sums, levels,
        win: new Float64Array(widest), tie: new Float64Array(widest), total: new Float64Array(widest),
        mass: new Float64Array(widest), cardSums: new Float64Array(52),
    };
};

// Regret matching: each action in proportion to its positive regret, uniform when none has any.
const matchInto = (regrets: Float64Array, k: number, n: number, out: Float64Array) => {
    for (let h = 0; h < n; h++) {
        let sum = 0;
        for (let a = 0; a < k; a++) {
            const r = regrets[a * n + h];
            if (r > 0) sum += r;
        }
        for (let a = 0; a < k; a++) {
            const r = regrets[a * n + h];
            out[a * n + h] = sum > 0 ? (r > 0 ? r / sum : 0) : 1 / k;
        }
    }
};

// The average strategy: the strategy sums normalised, uniform where a hand never reached.
const averageInto = (sums: Float64Array, k: number, n: number, out: Float64Array) => {
    for (let h = 0; h < n; h++) {
        let sum = 0;
        for (let a = 0; a < k; a++) sum += sums[a * n + h];
        for (let a = 0; a < k; a++) out[a * n + h] = sum > 0 ? sums[a * n + h] / sum : 1 / k;
    }
};

const terminal = (s: Solver, node: number, p: 0 | 1, reach: Float64Array, out: Float64Array) => {
    const {game} = s;
    const {tree} = game;
    const n = game.n[p];
    if (tree.kind[node] === FOLD) {
        const folder = tree.player[node];
        const stake = game.halfPot + tree.invested[2 * node + folder];
        const signed = folder === p ? -stake : stake;
        blockedMass(game, p, reach, s.mass, s.cardSums);
        for (let h = 0; h < n; h++) out[h] = signed * s.mass[h];
        return;
    }
    const stake = game.halfPot + tree.invested[2 * node];
    sweepShowdown(game.shows[p], reach, s.win, s.tie, s.total);
    for (let h = 0; h < n; h++) out[h] = stake * (2 * s.win[h] + s.tie[h] - s.total[h]);
};

// One player's update: counterfactual values for p's hands at `node`, given p's own reach and the
// other side's, with p's regrets and strategy sums updated on the way back.
const train = (s: Solver, node: number, p: 0 | 1, self: Float64Array, reach: Float64Array, out: Float64Array, t: number) => {
    const {tree} = s.game;
    if (tree.kind[node] !== DECISION) {
        terminal(s, node, p, reach, out);
        return;
    }
    const actor = tree.player[node];
    const d = tree.decisionOf[node];
    const k = tree.childCount[node];
    const first = tree.firstChild[node];
    const level = s.levels[tree.depth[node]];
    const nActor = s.game.n[actor];
    const n = s.game.n[p];
    const sigma = level.strategy;
    matchInto(s.regrets[d], k, nActor, sigma);
    out.fill(0, 0, n);
    if (actor === p) {
        for (let a = 0; a < k; a++) {
            const next = level.next;
            for (let h = 0; h < n; h++) next[h] = self[h] * sigma[a * n + h];
            const child = level.outs[a];
            train(s, first + a, p, next, reach, child, t);
            for (let h = 0; h < n; h++) out[h] += sigma[a * n + h] * child[h];
        }
        const regrets = s.regrets[d];
        const sums = s.sums[d];
        const plus = s.method === 'dcfr' ? t ** ALPHA / (t ** ALPHA + 1) : 1;
        const minus = s.method === 'dcfr' ? t ** BETA / (t ** BETA + 1) : 0;
        const weight = s.method === 'dcfr' ? t ** GAMMA : t;
        for (let a = 0; a < k; a++) {
            const child = level.outs[a];
            for (let h = 0; h < n; h++) {
                const i = a * n + h;
                const r = regrets[i] + child[h] - out[h];
                regrets[i] = r > 0 ? r * plus : r * minus;
                sums[i] += weight * self[h] * sigma[i];
            }
        }
        return;
    }
    for (let a = 0; a < k; a++) {
        const next = level.next;
        for (let h = 0; h < nActor; h++) next[h] = reach[h] * sigma[a * nActor + h];
        const child = level.outs[a];
        train(s, first + a, p, self, next, child, t);
        for (let h = 0; h < n; h++) out[h] += child[h];
    }
};

// The value of p's hands against the other side's average strategy: p's counter-strategy that wins
// the most when `best`, else p's own average strategy. `visit` sees every one of p's decisions on
// the way back, with p's values there and the other side's reach.
const evaluate = (
    s: Solver, node: number, p: 0 | 1, reach: Float64Array, out: Float64Array, best: boolean,
    visit?: (node: number, values: Float64Array, reach: Float64Array) => void,
) => {
    const {tree} = s.game;
    if (tree.kind[node] !== DECISION) {
        terminal(s, node, p, reach, out);
        return;
    }
    const actor = tree.player[node];
    const k = tree.childCount[node];
    const first = tree.firstChild[node];
    const level = s.levels[tree.depth[node]];
    const nActor = s.game.n[actor];
    const n = s.game.n[p];
    const sigma = level.strategy;
    averageInto(s.sums[tree.decisionOf[node]], k, nActor, sigma);
    if (actor === p) {
        out.fill(best ? -Infinity : 0, 0, n);
        for (let a = 0; a < k; a++) {
            const child = level.outs[a];
            evaluate(s, first + a, p, reach, child, best, visit);
            if (best) for (let h = 0; h < n; h++) out[h] = Math.max(out[h], child[h]);
            else for (let h = 0; h < n; h++) out[h] += sigma[a * n + h] * child[h];
        }
        visit?.(node, out, reach);
        return;
    }
    out.fill(0, 0, n);
    for (let a = 0; a < k; a++) {
        const next = level.next;
        for (let h = 0; h < nActor; h++) next[h] = reach[h] * sigma[a * nActor + h];
        const child = level.outs[a];
        evaluate(s, first + a, p, next, child, best, visit);
        for (let h = 0; h < n; h++) out[h] += child[h];
    }
};

const rootValue = (s: Solver, p: 0 | 1, best: boolean, visit?: (node: number, values: Float64Array, reach: Float64Array) => void): number => {
    const {game} = s;
    const q = p === 0 ? 1 : 0;
    const out = new Float64Array(game.n[p]);
    evaluate(s, 0, p, game.weights[q], out, best, visit);
    let sum = 0;
    for (let h = 0; h < game.n[p]; h++) sum += game.weights[p][h] * out[h];
    return sum / game.pairs;
};

// Exploitability in chips a hand: each player's counter-strategy gain, averaged.
const measure = (s: Solver): number => (rootValue(s, 0, true) + rootValue(s, 1, true)) / 2;

const isCheckpoint = (t: number) => t === 10 || t === 20 || t === 30 || t === 50 || t === 75 || (t >= 100 && t % 50 === 0);

// Each player's own reach at every one of its decisions under its average strategy.
const reachesOf = (s: Solver, p: 0 | 1): Map<number, Float64Array> => {
    const {tree} = s.game;
    const n = s.game.n[p];
    const at = new Map<number, Float64Array>();
    const walk = (node: number, self: Float64Array) => {
        if (tree.kind[node] !== DECISION) return;
        const k = tree.childCount[node];
        const first = tree.firstChild[node];
        if (tree.player[node] !== p) {
            for (let a = 0; a < k; a++) walk(first + a, self);
            return;
        }
        at.set(node, self);
        const sigma = new Float64Array(k * n);
        averageInto(s.sums[tree.decisionOf[node]], k, n, sigma);
        for (let a = 0; a < k; a++) walk(first + a, Float64Array.from(self, (w, h) => w * sigma[a * n + h]));
    };
    walk(0, s.game.weights[p]);
    return at;
};

const assemble = (s: Solver, input: RiverInput, iterations: number, history: RiverResult['history']): RiverResult => {
    const {game} = s;
    const {tree} = game;
    const strategyOffsets = new Int32Array(tree.decisions + 1);
    const viewOffsets = new Int32Array(tree.decisions + 1);
    const decisionNodes: number[] = [];
    for (let node = 0; node < tree.size; node++) if (tree.kind[node] === DECISION) decisionNodes[tree.decisionOf[node]] = node;
    for (let d = 0; d < tree.decisions; d++) {
        const node = decisionNodes[d];
        const k = tree.childCount[node];
        strategyOffsets[d + 1] = strategyOffsets[d] + k * game.n[tree.player[node]];
        viewOffsets[d + 1] = viewOffsets[d] + CLASSES * (k + 2);
    }
    const strategy = new Float32Array(strategyOffsets[tree.decisions]);
    for (let d = 0; d < tree.decisions; d++) {
        const node = decisionNodes[d];
        const k = tree.childCount[node];
        const n = game.n[tree.player[node]];
        const average = new Float64Array(k * n);
        averageInto(s.sums[d], k, n, average);
        strategy.set(average, strategyOffsets[d]);
    }

    // Each actor's values and the other side's reach at its own decisions, under both averages.
    const values = new Map<number, {values: Float64Array; mass: Float64Array}>();
    const ev: [number, number] = [0, 0];
    for (const p of [0, 1] as const) {
        ev[p] = rootValue(s, p, false, (node, at, reach) => {
            const mass = new Float64Array(game.n[p]);
            blockedMass(game, p, reach, mass, new Float64Array(52));
            values.set(node, {values: Float64Array.from(at.subarray(0, game.n[p])), mass});
        }) + game.halfPot;
    }
    const reaches = [reachesOf(s, 0), reachesOf(s, 1)];

    const view = new Float32Array(viewOffsets[tree.decisions]);
    for (let d = 0; d < tree.decisions; d++) {
        const node = decisionNodes[d];
        const actor = tree.player[node] as 0 | 1;
        const k = tree.childCount[node];
        const n = game.n[actor];
        const self = reaches[actor].get(node);
        const valued = values.get(node);
        const base = viewOffsets[d];
        const freq = new Float64Array(CLASSES * k);
        const combos = new Float64Array(CLASSES);
        const evSum = new Float64Array(CLASSES);
        const evWeight = new Float64Array(CLASSES);
        const offset = strategyOffsets[d];
        for (let h = 0; h < n; h++) {
            const reach = self ? self[h] : 0;
            if (reach <= 0) continue;
            const c = CLASS_OF_COMBO[game.combos[actor][h]];
            combos[c] += reach;
            for (let a = 0; a < k; a++) freq[c * k + a] += reach * strategy[offset + a * n + h];
            if (valued && valued.mass[h] > 0) {
                evSum[c] += reach * (valued.values[h] / valued.mass[h] + game.halfPot);
                evWeight[c] += reach;
            }
        }
        for (let c = 0; c < CLASSES; c++) {
            const cell = base + c * (k + 2);
            for (let a = 0; a < k; a++) view[cell + a] = combos[c] > 0 ? freq[c * k + a] / combos[c] : 0;
            view[cell + k] = combos[c];
            view[cell + k + 1] = evWeight[c] > 0 ? evSum[c] / evWeight[c] : Number.NaN;
        }
    }

    const last = history.at(-1);
    return {
        method: input.method,
        tree,
        combos: game.combos,
        weights: game.weights,
        strategy,
        strategyOffsets,
        view,
        viewOffsets,
        ev,
        exploitability: last ? (last.pct / 100) * input.config.pot : Number.NaN,
        exploitabilityPct: last ? last.pct : Number.NaN,
        history,
        iterations,
    };
};

// The solve as a generator. Sending 'stop' into it (drive's finishOnStop) ends the iterations and
// still returns the average strategy so far, measured.
export function* riverJob(input: RiverInput): Generator<RiverProgress, RiverResult, unknown> {
    const issues = validateRiver(input);
    if (issues.length > 0) throw new Error(`river: ${issues.join(', ')}`);
    const tree = buildTree(input.config, input.maxDecisions);
    if (!tree) throw new Error('river: too-big');
    const game = setUp(input, tree);
    const s = createSolver(game, input.method);
    const history: RiverResult['history'] = [];
    const outs: [Float64Array, Float64Array] = [new Float64Array(game.n[0]), new Float64Array(game.n[1])];
    let lastPct: number | null = null;
    let t = 0;
    while (t < input.maxIterations) {
        t++;
        train(s, 0, 0, game.weights[0], game.weights[1], outs[0], t);
        train(s, 0, 1, game.weights[1], game.weights[0], outs[1], t);
        if (isCheckpoint(t)) {
            lastPct = (measure(s) / input.config.pot) * 100;
            history.push({iterations: t, pct: lastPct});
            if (lastPct <= input.targetPct) break;
        }
        const command: unknown = yield {iterations: t, exploitabilityPct: lastPct};
        if (command === 'stop') break;
    }
    if (history.at(-1)?.iterations !== t) history.push({iterations: t, pct: (measure(s) / input.config.pot) * 100});
    return assemble(s, input, t, history);
}

export const RIVER_DEFAULTS = {maxIterations: RIVER_MAX_ITERATIONS, targetPct: RIVER_TARGET_PCT, maxDecisions: RIVER_LIMITS.maxDecisions, method: 'dcfr'} as const;
