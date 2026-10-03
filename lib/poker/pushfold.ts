// Heads-up push or fold: the small blind moves all in or folds; facing that, the big blind calls or
// folds. Stacks are counted in big blinds before the blinds and antes go in, so a call puts both
// whole stacks in the pot. Solved to equilibrium over the 169 starting-hand classes, each deal
// weighed by the preflop table's card-removal pair counts, by discounted CFR: regret matching+ with
// the positive regrets discounted by t^1.5/(t^1.5 + 1) each iteration and averages weighted by the
// square of the iteration. Pure.
//
// Results are net big blinds for the hand: a fold gives up the blind and ante posted, a fold to the
// push hands the pusher the big blind and its ante, and a call pays each side its equity in the pot.

import {CLASSES, COMBOS, classSize} from "@/lib/poker/cards";
import type {PreflopTable} from "@/lib/poker/preflop";

export const PUSH_FOLD_STACK = {min: 1, max: 25};
export const PUSH_FOLD_ANTE = {min: 0, max: 0.25};
// The solve stops once neither seat could gain more than this from switching strategies, bb a hand.
export const PUSH_FOLD_TOLERANCE = 1e-6;
export const PUSH_FOLD_MAX_ITERATIONS = 20_000;
const CHECK_EVERY = 10;
// Once the averaged profile is this close, the average starts over, leaving the early iterations'
// noise behind.
const RESTART_BELOW = 1e-3;
// A class whose action gains more than this either way, bb a hand, plays that action outright.
const PURE_GAIN = 1e-4;

export type PushFoldInput = {stack: number; ante: number};

export type PushFoldIssue = 'stack-range' | 'ante-range' | 'stack-below-posts';

export type PushFoldProgress = {iterations: number; exploitability: number};

export type PushFoldResult = {
    stack: number;
    ante: number;
    // Each class's probability of pushing (small blind) and of calling a push (big blind).
    push: Float64Array;
    call: Float64Array;
    // Pushing less folding for each small-blind class, and calling less folding for each big-blind
    // class facing the push, bb a hand, against the other seat's equilibrium strategy.
    pushGain: Float64Array;
    callGain: Float64Array;
    // The share of all 1,326 combos each seat plays.
    pushShare: number;
    callShare: number;
    // The small blind's result a hand at equilibrium; the big blind's is its negative.
    value: number;
    // What the counter-strategy that wins the most would gain against each seat, averaged, bb a hand.
    exploitability: number;
    iterations: number;
};

export const validatePushFold = ({stack, ante}: PushFoldInput): PushFoldIssue[] => {
    const issues: PushFoldIssue[] = [];
    if (!(stack >= PUSH_FOLD_STACK.min && stack <= PUSH_FOLD_STACK.max)) issues.push('stack-range');
    if (!(ante >= PUSH_FOLD_ANTE.min && ante <= PUSH_FOLD_ANTE.max)) issues.push('ante-range');
    if (issues.length === 0 && stack < 1 + ante) issues.push('stack-below-posts');
    return issues;
};

type Game = {
    pairs: Float64Array;
    // The small blind's showdown result a deal: equity × the pot, less its stack, times the deal's pairs.
    showdown: Float64Array;
    // What a call changes for the small blind against a fold, summed over deals — row i for its
    // class, and transposed so the big blind's sums also run along a row.
    called: Float64Array;
    calledByBig: Float64Array;
    dealsOf: Float64Array;
    total: number;
    smallLoss: number;
    bigLoss: number;
};

const gameOf = ({stack, ante}: PushFoldInput, table: PreflopTable): Game => {
    const bigLoss = 1 + ante;
    const showdown = new Float64Array(CLASSES * CLASSES);
    const called = new Float64Array(CLASSES * CLASSES);
    const calledByBig = new Float64Array(CLASSES * CLASSES);
    const dealsOf = new Float64Array(CLASSES);
    let total = 0;
    for (let i = 0; i < CLASSES; i++) {
        for (let j = 0; j < CLASSES; j++) {
            const n = table.pairs[i * CLASSES + j];
            showdown[i * CLASSES + j] = n * (table.equity(i, j) * 2 * stack - stack);
            called[i * CLASSES + j] = showdown[i * CLASSES + j] - n * bigLoss;
            calledByBig[j * CLASSES + i] = called[i * CLASSES + j];
            dealsOf[i] += n;
        }
        total += dealsOf[i];
    }
    return {pairs: table.pairs, showdown, called, calledByBig, dealsOf, total, smallLoss: 0.5 + ante, bigLoss};
};

// Regret matching+ needs only what acting gains over passing: pushing over folding for each
// small-blind class against `call`, and calling over folding for each big-blind class against `push`.
const smallGain = (game: Game, call: Float64Array, out: Float64Array) => {
    const {called, dealsOf} = game;
    const folded = game.bigLoss + game.smallLoss;
    for (let i = 0; i < CLASSES; i++) {
        let sum = dealsOf[i] * folded;
        const row = i * CLASSES;
        for (let j = 0; j < CLASSES; j++) sum += call[j] * called[row + j];
        out[i] = sum;
    }
};

const bigGain = (game: Game, push: Float64Array, out: Float64Array) => {
    const {calledByBig} = game;
    for (let j = 0; j < CLASSES; j++) {
        let sum = 0;
        const row = j * CLASSES;
        for (let i = 0; i < CLASSES; i++) sum -= push[i] * calledByBig[row + i];
        out[j] = sum;
    }
};

// Regret matching+: play each action in proportion to its positive regret; even when neither has any.
const matchRegrets = (plus: Float64Array, minus: Float64Array, out: Float64Array) => {
    for (let k = 0; k < CLASSES; k++) {
        const sum = plus[k] + minus[k];
        out[k] = sum > 0 ? plus[k] / sum : 0.5;
    }
};

// Acting regrets what it gains over the mix played, (1 − s)·gain; passing regrets −s·gain. A
// negative total is dropped, a positive one discounted by `keep`.
const updateRegrets = (gain: Float64Array, strategy: Float64Array, plus: Float64Array, minus: Float64Array, keep: number) => {
    for (let k = 0; k < CLASSES; k++) {
        const act = plus[k] + (1 - strategy[k]) * gain[k];
        const pass = minus[k] - strategy[k] * gain[k];
        plus[k] = act > 0 ? act * keep : 0;
        minus[k] = pass > 0 ? pass * keep : 0;
    }
};

type Measure = {value: number; exploitability: number; pushGain: Float64Array; callGain: Float64Array};

const measure = (game: Game, push: Float64Array, call: Float64Array): Measure => {
    let value = 0;
    let smallBest = 0;
    let bigBest = 0;
    const pushGain = new Float64Array(CLASSES);
    const callGain = new Float64Array(CLASSES);
    for (let i = 0; i < CLASSES; i++) {
        let pushValue = 0;
        for (let j = 0; j < CLASSES; j++) {
            const k = i * CLASSES + j;
            pushValue += call[j] * game.showdown[k] + (1 - call[j]) * game.pairs[k] * game.bigLoss;
        }
        const foldValue = -game.dealsOf[i] * game.smallLoss;
        value += push[i] * pushValue + (1 - push[i]) * foldValue;
        smallBest += Math.max(pushValue, foldValue);
        pushGain[i] = (pushValue - foldValue) / game.dealsOf[i];
    }
    for (let j = 0; j < CLASSES; j++) {
        let callValue = 0;
        let pushed = 0;
        let folded = 0;
        for (let i = 0; i < CLASSES; i++) {
            const k = i * CLASSES + j;
            callValue -= push[i] * game.showdown[k];
            pushed += push[i] * game.pairs[k];
            folded += (1 - push[i]) * game.pairs[k];
        }
        const foldValue = -pushed * game.bigLoss;
        // The big blind collects the small blind's post and ante whenever the small blind folds.
        bigBest += folded * game.smallLoss + Math.max(callValue, foldValue);
        callGain[j] = pushed > 0 ? (callValue - foldValue) / pushed : 0;
    }
    value /= game.total;
    smallBest /= game.total;
    bigBest /= game.total;
    // Each seat's gain from switching to its counter-strategy, averaged over the two seats.
    return {value, exploitability: (smallBest - value + (bigBest + value)) / 2, pushGain, callGain};
};

type Profile = {push: Float64Array; call: Float64Array; measured: Measure};

// What is left of an average's noise sits on hands that are not close to indifferent. Playing every
// clearly-signed class outright is kept only when that profile still meets the tolerance, measured
// afresh — so the exploitability shown is always the profile shown.
const settle = (game: Game, profile: Profile): Profile => {
    const snap = (strategy: Float64Array, gains: Float64Array) =>
        strategy.map((s, k) => (gains[k] > PURE_GAIN ? 1 : gains[k] < -PURE_GAIN ? 0 : s));
    const push = snap(profile.push, profile.measured.pushGain);
    const call = snap(profile.call, profile.measured.callGain);
    const measured = measure(game, push, call);
    return measured.exploitability <= PUSH_FOLD_TOLERANCE ? {push, call, measured} : profile;
};

const comboShare = (strategy: Float64Array): number => {
    let sum = 0;
    for (let k = 0; k < CLASSES; k++) sum += strategy[k] * classSize(k);
    return sum / COMBOS;
};

// Alternating updates, checked every CHECK_EVERY iterations: the current strategies are taken as
// soon as they meet the tolerance (they carry no averaging noise), else the average when it does.
export function* pushFoldJob(input: PushFoldInput, table: PreflopTable): Generator<PushFoldProgress, PushFoldResult> {
    const issues = validatePushFold(input);
    if (issues.length > 0) throw new Error(`push/fold: ${issues.join(', ')}`);
    const game = gameOf(input, table);
    const push = new Float64Array(CLASSES);
    const call = new Float64Array(CLASSES);
    const pushPlus = new Float64Array(CLASSES);
    const pushMinus = new Float64Array(CLASSES);
    const callPlus = new Float64Array(CLASSES);
    const callMinus = new Float64Array(CLASSES);
    const sumPush = new Float64Array(CLASSES);
    const sumCall = new Float64Array(CLASSES);
    const gain = new Float64Array(CLASSES);
    matchRegrets(pushPlus, pushMinus, push);
    matchRegrets(callPlus, callMinus, call);
    let weight = 0;
    const averaged = (): Profile => {
        const avgPush = sumPush.map((sum) => sum / weight);
        const avgCall = sumCall.map((sum) => sum / weight);
        return {push: avgPush, call: avgCall, measured: measure(game, avgPush, avgCall)};
    };
    let since = 0;
    let restarted = false;
    let found: Profile | null = null;
    let closest: Profile | null = null;
    let iterations = 0;
    while (iterations < PUSH_FOLD_MAX_ITERATIONS) {
        iterations++;
        const keep = iterations ** 1.5 / (iterations ** 1.5 + 1);
        smallGain(game, call, gain);
        updateRegrets(gain, push, pushPlus, pushMinus, keep);
        matchRegrets(pushPlus, pushMinus, push);
        bigGain(game, push, gain);
        updateRegrets(gain, call, callPlus, callMinus, keep);
        matchRegrets(callPlus, callMinus, call);
        since++;
        weight += since * since;
        for (let k = 0; k < CLASSES; k++) {
            sumPush[k] += since * since * push[k];
            sumCall[k] += since * since * call[k];
        }
        if (iterations % CHECK_EVERY !== 0) continue;
        const current: Profile = {push: Float64Array.from(push), call: Float64Array.from(call), measured: measure(game, push, call)};
        if (current.measured.exploitability <= PUSH_FOLD_TOLERANCE) {
            found = current;
            break;
        }
        const average = averaged();
        if (average.measured.exploitability <= PUSH_FOLD_TOLERANCE) {
            found = average;
            break;
        }
        closest = [current, average, closest].reduce<Profile | null>((x, y) => (y && (!x || y.measured.exploitability < x.measured.exploitability) ? y : x), null);
        if (!restarted && average.measured.exploitability < RESTART_BELOW) {
            restarted = true;
            since = 0;
            weight = 0;
            sumPush.fill(0);
            sumCall.fill(0);
        }
        yield {iterations, exploitability: Math.min(current.measured.exploitability, average.measured.exploitability)};
    }
    const best = found ?? closest;
    if (best === null) throw new Error('push/fold: no iterations');
    const shown = settle(game, best);
    return {
        stack: input.stack, ante: input.ante, push: shown.push, call: shown.call,
        pushGain: shown.measured.pushGain, callGain: shown.measured.callGain,
        pushShare: comboShare(shown.push), callShare: comboShare(shown.call),
        value: shown.measured.value, exploitability: shown.measured.exploitability, iterations,
    };
}
