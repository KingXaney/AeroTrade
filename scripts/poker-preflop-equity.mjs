// Generates lib/poker/data/preflop-equity.json: the exact all-in equity of every starting-hand
// class against every other, before the flop. The push/fold solver and the equity calculator's
// preflop table read it; it is committed, and never edited by hand.
//
// For each pair of classes, every pair of compatible combos is reduced to its suit pattern (24
// relabelings of the four suits), one combo pair per pattern is played out over all 1,712,304
// boards, and the patterns are averaged by how many combo pairs share them — so every entry is
// exact. About 1.6×10¹¹ hand evaluations, spread over every core with node:worker_threads (a few
// minutes). Needs Node ≥ 22.18, which loads the import-free lib/poker/cards.ts and evaluator.ts.
//
// It also writes lib/poker/data/preflop-ranking.json: the 169 classes from the highest equity against
// a random hand to the lowest, which the range editor's "Top x%" reads without loading the table.
//
//   node scripts/poker-preflop-equity.mjs             write the table and the ranking
//   node scripts/poker-preflop-equity.mjs --check     recompute 40 random entries against the file
//   node scripts/poker-preflop-equity.mjs --ranking   rewrite the ranking from the table on disk

import {Worker, isMainThread, parentPort} from 'node:worker_threads';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {availableParallelism} from 'node:os';
import {fileURLToPath} from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = `${ROOT}lib/poker/data/preflop-equity.json`;
const RANKING_OUT = `${ROOT}lib/poker/data/preflop-ranking.json`;
const SCALE = 100_000;
const {CLASS_COMBOS, COMBO_HI, COMBO_LO, CLASSES} = await import(`${ROOT}lib/poker/cards.ts`);

const suit = (card) => card & 3;
const rank = (card) => card >> 2;

// A combo pair's suit pattern: the smallest of its 24 suit relabelings, each hand's cards sorted.
const PERMS = [];
for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) for (let c = 0; c < 4; c++) for (let d = 0; d < 4; d++) {
    if (new Set([a, b, c, d]).size === 4) PERMS.push([a, b, c, d]);
}
const relabel = (card, perm) => rank(card) * 4 + perm[suit(card)];
const patternOf = (a1, a2, b1, b2) => {
    let best = null;
    for (const perm of PERMS) {
        const ha = [relabel(a1, perm), relabel(a2, perm)].sort((x, y) => y - x);
        const hb = [relabel(b1, perm), relabel(b2, perm)].sort((x, y) => y - x);
        const key = `${ha[0]},${ha[1]},${hb[0]},${hb[1]}`;
        if (best === null || key < best) best = key;
    }
    return best;
};

// Every class pair i < j as its patterns: [{cards: [a1, a2, b1, b2], count}].
const casesFor = (i, j) => {
    const patterns = new Map();
    for (const a of CLASS_COMBOS[i]) for (const b of CLASS_COMBOS[j]) {
        const cards = [COMBO_HI[a], COMBO_LO[a], COMBO_HI[b], COMBO_LO[b]];
        if (new Set(cards).size < 4) continue;
        const key = patternOf(...cards);
        const entry = patterns.get(key) ?? {cards, count: 0};
        entry.count++;
        patterns.set(key, entry);
    }
    return [...patterns.values()];
};

// The ranking: each class's equity against a random hand, weighed by the combo pairs that share no
// card — the same sum lib/poker/preflop.ts decodePreflop makes — highest first, ties by class id.
const writeRanking = (upper, scale) => {
    const upperIndex = (i, j) => i * CLASSES - (i * (i + 1)) / 2 + (j - i - 1);
    const equity = (i, j) => (i === j ? 0.5 : i < j ? upper[upperIndex(i, j)] / scale : 1 - upper[upperIndex(j, i)] / scale);
    const vsRandom = [];
    for (let i = 0; i < CLASSES; i++) {
        let num = 0;
        let den = 0;
        for (let j = 0; j < CLASSES; j++) {
            let n = 0;
            for (const a of CLASS_COMBOS[i]) for (const b of CLASS_COMBOS[j]) {
                if (COMBO_HI[a] !== COMBO_HI[b] && COMBO_HI[a] !== COMBO_LO[b] && COMBO_LO[a] !== COMBO_HI[b] && COMBO_LO[a] !== COMBO_LO[b]) n++;
            }
            num += n * equity(i, j);
            den += n;
        }
        vsRandom.push(num / den);
    }
    const ranking = Array.from({length: CLASSES}, (_, id) => id).sort((x, y) => vsRandom[y] - vsRandom[x] || x - y);
    writeFileSync(RANKING_OUT, `${JSON.stringify({format: 1, ranking})}\n`);
    console.log('wrote lib/poker/data/preflop-ranking.json');
};

if (isMainThread && process.argv.includes('--ranking')) {
    const file = JSON.parse(readFileSync(OUT, 'utf8'));
    writeRanking(file.upper, file.scale);
    process.exit(0);
}

if (!isMainThread) {
    const {evaluateMasks} = await import(`${ROOT}lib/poker/evaluator.ts`);
    // One combo pair over every board: wins, ties, boards.
    const playOut = ([a1, a2, b1, b2]) => {
        const dead = new Set([a1, a2, b1, b2]);
        const deck = [];
        for (let card = 0; card < 52; card++) if (!dead.has(card)) deck.push(card);
        const ha = [0, 0, 0, 0];
        const hb = [0, 0, 0, 0];
        for (const card of [a1, a2]) ha[suit(card)] |= 1 << rank(card);
        for (const card of [b1, b2]) hb[suit(card)] |= 1 << rank(card);
        const m = [0, 0, 0, 0];
        const bitOf = deck.map((card) => 1 << rank(card));
        const suitOf = deck.map(suit);
        let wins = 0;
        let ties = 0;
        let boards = 0;
        const n = deck.length;
        for (let c1 = 0; c1 < n; c1++) {
            m[suitOf[c1]] ^= bitOf[c1];
            for (let c2 = c1 + 1; c2 < n; c2++) {
                m[suitOf[c2]] ^= bitOf[c2];
                for (let c3 = c2 + 1; c3 < n; c3++) {
                    m[suitOf[c3]] ^= bitOf[c3];
                    for (let c4 = c3 + 1; c4 < n; c4++) {
                        m[suitOf[c4]] ^= bitOf[c4];
                        for (let c5 = c4 + 1; c5 < n; c5++) {
                            const s = suitOf[c5];
                            m[s] ^= bitOf[c5];
                            const va = evaluateMasks(m[0] | ha[0], m[1] | ha[1], m[2] | ha[2], m[3] | ha[3]);
                            const vb = evaluateMasks(m[0] | hb[0], m[1] | hb[1], m[2] | hb[2], m[3] | hb[3]);
                            if (va > vb) wins++;
                            else if (va === vb) ties++;
                            boards++;
                            m[s] ^= bitOf[c5];
                        }
                        m[suitOf[c4]] ^= bitOf[c4];
                    }
                    m[suitOf[c3]] ^= bitOf[c3];
                }
                m[suitOf[c2]] ^= bitOf[c2];
            }
            m[suitOf[c1]] ^= bitOf[c1];
        }
        return {wins, ties, boards};
    };
    parentPort.on('message', (job) => {
        if (job === null) process.exit(0);
        parentPort.postMessage({id: job.id, ...playOut(job.cards)});
    });
} else {
    const check = process.argv.includes('--check');
    const pairs = [];
    for (let i = 0; i < CLASSES; i++) for (let j = i + 1; j < CLASSES; j++) pairs.push([i, j]);
    const sampled = check ? pairs.filter((_, k) => (k * 2654435761 >>> 0) % pairs.length < 40) : pairs;
    const jobs = [];
    const plan = sampled.map(([i, j]) => ({i, j, cases: casesFor(i, j).map((c) => ({...c, id: jobs.push(c.cards) - 1}))}));
    console.log(`${sampled.length} class pairs, ${jobs.length} suit patterns, ${availableParallelism()} threads`);

    const results = new Array(jobs.length);
    const started = Date.now();
    let next = 0;
    let done = 0;
    await new Promise((resolve, reject) => {
        const threads = Array.from({length: availableParallelism()}, () => new Worker(new URL(import.meta.url)));
        const feed = (worker) => {
            if (next >= jobs.length) {
                worker.postMessage(null);
                return;
            }
            const id = next++;
            worker.postMessage({id, cards: jobs[id]});
        };
        for (const worker of threads) {
            worker.on('message', (result) => {
                results[result.id] = result;
                done++;
                if (done % 2000 === 0) console.log(`${done}/${jobs.length} · ${Math.round((Date.now() - started) / 1000)} s`);
                if (done === jobs.length) resolve();
                feed(worker);
            });
            worker.on('error', reject);
            feed(worker);
        }
    });

    const equityOf = ({cases}) => {
        let total = 0;
        let weight = 0;
        for (const c of cases) {
            const r = results[c.id];
            total += c.count * (r.wins + r.ties / 2) / r.boards;
            weight += c.count;
        }
        return total / weight;
    };

    if (check) {
        const file = JSON.parse(readFileSync(OUT, 'utf8'));
        let worst = 0;
        for (const entry of plan) {
            const k = entry.i * CLASSES - (entry.i * (entry.i + 1)) / 2 + (entry.j - entry.i - 1);
            worst = Math.max(worst, Math.abs(file.upper[k] / SCALE - equityOf(entry)));
        }
        console.log(`checked ${plan.length} entries; largest difference ${worst.toExponential(2)}`);
        process.exit(worst <= 1 / SCALE ? 0 : 1);
    }

    const upper = plan.map((entry) => Math.round(equityOf(entry) * SCALE));
    mkdirSync(`${ROOT}lib/poker/data`, {recursive: true});
    writeFileSync(OUT, `${JSON.stringify({format: 1, scale: SCALE, classes: CLASSES, upper})}\n`);
    console.log(`wrote ${upper.length} entries to lib/poker/data/preflop-equity.json in ${Math.round((Date.now() - started) / 1000)} s`);
    writeRanking(upper, SCALE);
}
