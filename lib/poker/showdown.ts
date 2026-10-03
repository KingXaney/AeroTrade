// One board's showdown between two lists of hands: for each live hand on side A, the side-B weight it
// wins against, ties with and meets in all, leaving out every B hand that shares a card with it.
// Exact equity runs it once per board; the river solver runs it at every showdown it reaches.
//
// With both sides in value order, one walk up side A carries the B weight below and level with each
// hand as running sums, and per-card sums take off the B hands holding either of its two cards. The
// B hand holding both is A's own hand, level with it, so it comes off twice and goes back once.
// Ordering is O(n log n) and each sweep O(n + 52); lib/poker/__tests__/showdown.test.ts checks it
// against every pair. Import-free.

export type ShowdownHands = {
    count: number;
    hi: Uint8Array;
    lo: Uint8Array;
    // This board's hand values, larger winning; negative where the board holds one of the cards.
    values: Int32Array;
};

export type Showdown = {
    a: ShowdownHands;
    b: ShowdownHands;
    // For each A hand, the B hand holding the same two cards, or −1.
    same: Int32Array;
    orderA: Int32Array;
    liveA: number;
    orderB: Int32Array;
    liveB: number;
    keys: Float64Array;
    // Per-card B weight: every live hand [0, 52), those below [52, 104), those level [104, 156).
    sums: Float64Array;
};

// A side never holds more than 1,326 hands, so a value and an index pack into one exact double.
const INDEX_SPAN = 2048;

const pairKey = (x: number, y: number): number => (x > y ? x * 52 + y : y * 52 + x);

export const createShowdown = (a: ShowdownHands, b: ShowdownHands): Showdown => {
    const slot = new Int32Array(52 * 52).fill(-1);
    for (let j = 0; j < b.count; j++) slot[pairKey(b.hi[j], b.lo[j])] = j;
    const same = new Int32Array(a.count);
    for (let i = 0; i < a.count; i++) same[i] = slot[pairKey(a.hi[i], a.lo[i])];
    return {
        a, b, same,
        orderA: new Int32Array(a.count), liveA: 0,
        orderB: new Int32Array(b.count), liveB: 0,
        keys: new Float64Array(Math.max(a.count, b.count)),
        sums: new Float64Array(156),
    };
};

const orderSide = (hands: ShowdownHands, order: Int32Array, keys: Float64Array): number => {
    let n = 0;
    for (let i = 0; i < hands.count; i++) if (hands.values[i] >= 0) keys[n++] = hands.values[i] * INDEX_SPAN + i;
    const sorted = keys.subarray(0, n).sort();
    for (let k = 0; k < n; k++) order[k] = sorted[k] % INDEX_SPAN;
    return n;
};

// Puts both sides in value order; call it again whenever the values change (a new board).
export const orderShowdown = (s: Showdown): void => {
    s.liveA = orderSide(s.a, s.orderA, s.keys);
    s.liveB = orderSide(s.b, s.orderB, s.keys);
};

// Fills win, tie and total for every A hand (zero for those the board blocks) against `weightB`.
export const sweepShowdown = (s: Showdown, weightB: Float64Array, win: Float64Array, tie: Float64Array, total: Float64Array): void => {
    const {a, b, orderA, orderB, liveA, liveB, same, sums} = s;
    sums.fill(0);
    win.fill(0, 0, a.count);
    tie.fill(0, 0, a.count);
    total.fill(0, 0, a.count);
    let all = 0;
    for (let k = 0; k < liveB; k++) {
        const j = orderB[k];
        const w = weightB[j];
        all += w;
        sums[b.hi[j]] += w;
        sums[b.lo[j]] += w;
    }
    let below = 0;
    let level = 0;
    let p = 0;
    let q = 0;
    let group = -1;
    for (let k = 0; k < liveA; k++) {
        const i = orderA[k];
        const v = a.values[i];
        if (v !== group) {
            // The last level group drops below; gather the B hands level with this value.
            for (let r = p; r < q; r++) {
                const j = orderB[r];
                sums[104 + b.hi[j]] = 0;
                sums[104 + b.lo[j]] = 0;
            }
            while (p < liveB && b.values[orderB[p]] < v) {
                const j = orderB[p++];
                const w = weightB[j];
                below += w;
                sums[52 + b.hi[j]] += w;
                sums[52 + b.lo[j]] += w;
            }
            level = 0;
            q = p;
            while (q < liveB && b.values[orderB[q]] === v) {
                const j = orderB[q++];
                const w = weightB[j];
                level += w;
                sums[104 + b.hi[j]] += w;
                sums[104 + b.lo[j]] += w;
            }
            group = v;
        }
        const x = a.hi[i];
        const y = a.lo[i];
        const j = same[i];
        const own = j >= 0 && b.values[j] >= 0 ? weightB[j] : 0;
        win[i] = below - sums[52 + x] - sums[52 + y];
        tie[i] = level - sums[104 + x] - sums[104 + y] + own;
        total[i] = all - sums[x] - sums[y] + own;
    }
};
