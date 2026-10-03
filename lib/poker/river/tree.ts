// The river's betting tree: who acts, what each action puts in, and where each line ends, as flat
// arrays a solver can walk without allocating. Pure.
//
// Player 0 is out of position and acts first; player 1 is in position. A bet is a share of the pot
// at the moment it is made; a raise first matches the bet, then adds its share of the pot that call
// would make. A size at or above what is left behind is the all-in, equal amounts merge, and a raise
// adds at least the last bet or raise — the no-limit minimum. Both players start the river with the
// same stack behind, so a call never leaves a side pot.

export const RIVER_LIMITS = {
    maxDecisions: 400,
    // The page thread shares its time with the page, so it takes smaller trees.
    maxDecisionsOnPage: 120,
    maxRaises: 4,
    maxSizes: 4,
    maxSizePct: 1000,
    maxBytes: 64 * 1024 * 1024,
} as const;

export type RiverConfig = {
    pot: number;
    stack: number;
    // Shares of the pot, in percent, for each player: [out of position, in position].
    betSizes: readonly [readonly number[], readonly number[]];
    raiseSizes: readonly [readonly number[], readonly number[]];
    allIn: boolean;
    raiseCap: number;
};

export const ACTIONS = ['check', 'bet', 'call', 'fold', 'raise', 'all-in'] as const;
export type ActionKind = (typeof ACTIONS)[number];
const ACTION_INDEX: Record<ActionKind, number> = {check: 0, bet: 1, call: 2, fold: 3, raise: 4, 'all-in': 5};

export const DECISION = 0;
export const FOLD = 1;
export const SHOWDOWN = 2;

export type RiverTree = {
    config: RiverConfig;
    size: number;
    kind: Uint8Array;
    // The actor at a decision; the player who folded at a fold.
    player: Uint8Array;
    // Two per node: what each player has put in on the river by then.
    invested: Float64Array;
    parent: Int32Array;
    // The action that led to the node (an ACTIONS index) and the chips it put in.
    action: Uint8Array;
    amount: Float64Array;
    firstChild: Int32Array;
    childCount: Uint8Array;
    depth: Uint8Array;
    // A decision's dense index (its solver arrays), −1 at a terminal.
    decisionOf: Int32Array;
    decisions: number;
    maxDepth: number;
    maxActions: number;
};

export type TreeIssue = 'pot' | 'stack' | 'sizes' | 'raise-cap' | 'too-big';

const SAME = 1e-6;

type State = {actor: 0 | 1; invested: [number, number]; lastIncrement: number; raises: number};
type Branch = {action: ActionKind; amount: number; next: State | {terminal: typeof FOLD | typeof SHOWDOWN; invested: [number, number]; folder: 0 | 1}};

const validSizes = (sizes: readonly number[]) =>
    sizes.length <= RIVER_LIMITS.maxSizes && sizes.every((pct) => Number.isFinite(pct) && pct > 0 && pct <= RIVER_LIMITS.maxSizePct);

export const validateConfig = (config: RiverConfig): TreeIssue[] => {
    const issues: TreeIssue[] = [];
    if (!(Number.isFinite(config.pot) && config.pot > 0)) issues.push('pot');
    if (!(Number.isFinite(config.stack) && config.stack >= 0)) issues.push('stack');
    if (![...config.betSizes, ...config.raiseSizes].every(validSizes)) issues.push('sizes');
    if (!(Number.isInteger(config.raiseCap) && config.raiseCap >= 0 && config.raiseCap <= RIVER_LIMITS.maxRaises)) issues.push('raise-cap');
    return issues;
};

// The amounts a list of sizes puts in: capped at what is left, equal ones merged, the all-in added
// when offered, smallest first.
const amountsOf = (wanted: readonly number[], left: number, allIn: boolean): number[] => {
    const out: number[] = [];
    for (const amount of wanted) {
        const capped = Math.min(amount, left);
        if (capped > SAME && !out.some((x) => Math.abs(x - capped) < SAME)) out.push(capped);
    }
    if (allIn && left > SAME && !out.some((x) => Math.abs(x - left) < SAME)) out.push(left);
    return out.sort((x, y) => x - y);
};

const branchesOf = (state: State, config: RiverConfig): Branch[] => {
    const me = state.actor;
    const other: 0 | 1 = me === 0 ? 1 : 0;
    const left = config.stack - state.invested[me];
    const toCall = state.invested[other] - state.invested[me];
    const pot = config.pot + state.invested[0] + state.invested[1];
    const after = (amount: number): [number, number] => {
        const invested: [number, number] = [state.invested[0], state.invested[1]];
        invested[me] += amount;
        return invested;
    };
    const out: Branch[] = [];
    if (toCall <= SAME) {
        // Checked to the in-position player, a check ends the betting.
        out.push({action: 'check', amount: 0, next: me === 0
            ? {actor: 1, invested: state.invested, lastIncrement: 0, raises: 0}
            : {terminal: SHOWDOWN, invested: state.invested, folder: 0}});
        for (const amount of amountsOf(config.betSizes[me].map((pct) => (pct / 100) * pot), left, config.allIn)) {
            out.push({action: amount >= left - SAME ? 'all-in' : 'bet', amount, next: {actor: other, invested: after(amount), lastIncrement: amount, raises: 0}});
        }
        return out;
    }
    out.push({action: 'fold', amount: 0, next: {terminal: FOLD, invested: state.invested, folder: me}});
    out.push({action: 'call', amount: toCall, next: {terminal: SHOWDOWN, invested: after(toCall), folder: 0}});
    if (state.raises < config.raiseCap && left > toCall + SAME) {
        // A raise adds its share of the pot after the call, and at least the last increment.
        const potAfterCall = pot + toCall;
        const wanted = config.raiseSizes[me].map((pct) => toCall + Math.max((pct / 100) * potAfterCall, state.lastIncrement));
        for (const amount of amountsOf(wanted, left, config.allIn)) {
            if (amount <= toCall + SAME) continue;
            out.push({action: amount >= left - SAME ? 'all-in' : 'raise', amount, next: {actor: other, invested: after(amount), lastIncrement: amount - toCall, raises: state.raises + 1}});
        }
    }
    return out;
};

// Builds the tree breadth first, so every node's children sit side by side; null when it would
// hold more than `maxDecisions` decisions.
export const buildTree = (config: RiverConfig, maxDecisions: number = RIVER_LIMITS.maxDecisions): RiverTree | null => {
    type Pending = {parent: number; action: ActionKind; amount: number; depth: number; next: Branch['next']};
    const kind: number[] = [];
    const player: number[] = [];
    const invested: number[] = [];
    const parent: number[] = [];
    const action: number[] = [];
    const amount: number[] = [];
    const firstChild: number[] = [];
    const childCount: number[] = [];
    const depth: number[] = [];
    const decisionOf: number[] = [];
    let decisions = 0;
    let maxActions = 0;
    const queue: Pending[] = [{parent: -1, action: 'check', amount: 0, depth: 0, next: {actor: 0, invested: [0, 0], lastIncrement: 0, raises: 0}}];
    for (let head = 0; head < queue.length; head++) {
        const item = queue[head];
        const id = kind.length;
        parent.push(item.parent);
        action.push(ACTION_INDEX[item.action]);
        amount.push(item.amount);
        depth.push(item.depth);
        firstChild.push(-1);
        childCount.push(0);
        if ('terminal' in item.next) {
            kind.push(item.next.terminal);
            player.push(item.next.folder);
            invested.push(item.next.invested[0], item.next.invested[1]);
            decisionOf.push(-1);
            continue;
        }
        if (decisions >= maxDecisions) return null;
        kind.push(DECISION);
        player.push(item.next.actor);
        invested.push(item.next.invested[0], item.next.invested[1]);
        decisionOf.push(decisions++);
        const branches = branchesOf(item.next, config);
        maxActions = Math.max(maxActions, branches.length);
        firstChild[id] = queue.length;
        childCount[id] = branches.length;
        for (const branch of branches) queue.push({parent: id, action: branch.action, amount: branch.amount, depth: item.depth + 1, next: branch.next});
    }
    return {
        config,
        size: kind.length,
        kind: Uint8Array.from(kind),
        player: Uint8Array.from(player),
        invested: Float64Array.from(invested),
        parent: Int32Array.from(parent),
        action: Uint8Array.from(action),
        amount: Float64Array.from(amount),
        firstChild: Int32Array.from(firstChild),
        childCount: Uint8Array.from(childCount),
        depth: Uint8Array.from(depth),
        decisionOf: Int32Array.from(decisionOf),
        decisions,
        maxDepth: Math.max(...depth),
        maxActions,
    };
};

export const actionKind = (tree: RiverTree, node: number): ActionKind => ACTIONS[tree.action[node]];

// The nodes from the root to `node`, root first.
export const pathTo = (tree: RiverTree, node: number): number[] => {
    const path: number[] = [];
    for (let at = node; at >= 0; at = tree.parent[at]) path.unshift(at);
    return path;
};

// The solver's memory for a tree: a regret and a strategy sum for every action and hand at every
// decision, plus the per-depth scratch a walk uses.
export const estimateBytes = (tree: RiverTree, live: readonly [number, number]): number => {
    let cells = 0;
    for (let node = 0; node < tree.size; node++) if (tree.kind[node] === DECISION) cells += tree.childCount[node] * live[tree.player[node]];
    const widest = Math.max(live[0], live[1]);
    return cells * 2 * 8 + (tree.maxDepth + 1) * (tree.maxActions + 3) * widest * 8;
};

// What one iteration walks: every action at every decision for both sides' hands, and every
// terminal once per hand. About 13 ns a unit in Node on an M-series laptop (measured on five spots,
// 0.15 to 3 ms an iteration) — the page's estimate, not a promise.
export const NS_PER_WORK = 13;

export const estimateWork = (tree: RiverTree, live: readonly [number, number]): number => {
    let work = 0;
    for (let node = 0; node < tree.size; node++) work += (tree.kind[node] === DECISION ? tree.childCount[node] : 1) * (live[0] + live[1]);
    return work;
};

export const estimateMsPerIteration = (tree: RiverTree, live: readonly [number, number]): number => (estimateWork(tree, live) * NS_PER_WORK) / 1e6;
