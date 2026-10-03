// An independent check of every daily puzzle's answer key, keyed by puzzle id. A count is
// enumerated by brute force, a probability or expected value simulated, an estimate computed
// directly — never by repeating the solution's own formula where a brute force is cheap. Read
// by puzzles.test.ts, which fails when a puzzle has no check or its stated answer misses.

export type PuzzleCheck =
    // The true value, worked out another way; `within` for a numerical method (default 1e-9).
    | {kind: 'exact'; value: () => number; within?: number}
    // One trial's outcome: 0/1 for a probability, a payout for an expected value.
    | {kind: 'simulate'; trial: (random: () => number) => number; trials?: number};

const die = (random: () => number): number => 1 + Math.floor(random() * 6);
const coin = (random: () => number): boolean => random() < 0.5;

const shuffled = <T>(items: readonly T[], random: () => number): T[] => {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
};

// Cards 0..51: rank = card >> 2 (0 is the ace), suit = card & 3 (0 is spades).
const DECK = Array.from({length: 52}, (_, card) => card);
const isAce = (card: number) => card >> 2 === 0;

const permutations = (n: number): number[][] => {
    if (n === 0) return [[]];
    return permutations(n - 1).flatMap((perm) => Array.from({length: n}, (_, at) => [...perm.slice(0, at), n - 1, ...perm.slice(at)]));
};

const count = (n: number, keep: (i: number) => boolean): number => {
    let total = 0;
    for (let i = 0; i < n; i++) if (keep(i)) total++;
    return total;
};

// Decimal digits of a big product, least significant first.
const bigTimes = (digits: number[], factor: number): number[] => {
    const out: number[] = [];
    let carry = 0;
    for (const digit of digits) {
        const v = digit * factor + carry;
        out.push(v % 10);
        carry = Math.floor(v / 10);
    }
    while (carry > 0) {
        out.push(carry % 10);
        carry = Math.floor(carry / 10);
    }
    return out;
};

// Normal-form game search: the first move that wins for sure from `start`, if any.
const winningMoves = <S>(start: S, moves: (s: S) => S[], key: (s: S) => string, lost: (s: S) => boolean): S[] => {
    const memo = new Map<string, boolean>();
    const wins = (s: S): boolean => {
        const k = key(s);
        const cached = memo.get(k);
        if (cached !== undefined) return cached;
        // The player to move at a terminal position has lost: the other player took the last one.
        const result = !lost(s) && moves(s).some((next) => !wins(next));
        memo.set(k, result);
        return result;
    };
    return moves(start).filter((next) => !wins(next));
};

export const PUZZLE_CHECKS: Readonly<Record<string, PuzzleCheck>> = {
    // ---- probability -----------------------------------------------------------------------
    'two-dice-seven': {kind: 'exact', value: () => count(36, (i) => (i % 6) + Math.floor(i / 6) + 2 === 7) / 36},
    'at-least-one-six': {kind: 'exact', value: () => count(1296, (i) => [0, 1, 2, 3].some((k) => Math.floor(i / 6 ** k) % 6 === 5)) / 1296},
    'two-children': {
        kind: 'simulate',
        trial: (random) => {
            for (;;) {
                const a = coin(random);
                const b = coin(random);
                if (a || b) return a && b ? 1 : 0;
            }
        },
    },
    'shared-birthday': {
        kind: 'simulate',
        trials: 100_000,
        trial: (random) => {
            const seen = new Set<number>();
            for (let i = 0; i < 23; i++) {
                const day = Math.floor(random() * 365);
                if (seen.has(day)) return 1;
                seen.add(day);
            }
            return 0;
        },
    },
    'three-cards': {
        kind: 'simulate',
        trial: (random) => {
            for (;;) {
                const card = [['red', 'red'], ['white', 'white'], ['red', 'white']][Math.floor(random() * 3)];
                const up = Math.floor(random() * 2);
                if (card[up] === 'red') return card[1 - up] === 'red' ? 1 : 0;
            }
        },
    },
    'three-doors': {
        kind: 'simulate',
        trial: (random) => {
            const prize = Math.floor(random() * 3);
            const pick = Math.floor(random() * 3);
            const empties = [0, 1, 2].filter((d) => d !== pick && d !== prize);
            const opened = empties[Math.floor(random() * empties.length)];
            const switched = [0, 1, 2].find((d) => d !== pick && d !== opened);
            return switched === prize ? 1 : 0;
        },
    },
    'after-the-first-ace': {
        kind: 'simulate',
        trials: 400_000,
        trial: (random) => {
            const deck = shuffled(DECK, random);
            const first = deck.findIndex(isAce);
            return deck[first + 1] === 0 ? 1 : 0;
        },
    },
    'matching-socks': {
        kind: 'exact',
        value: () => {
            const socks = ['r', 'r', 'r', 'r', 'b', 'b', 'b', 'b'];
            let pairs = 0;
            let matching = 0;
            for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) {
                pairs++;
                if (socks[i] === socks[j]) matching++;
            }
            return matching / pairs;
        },
    },
    'broken-stick': {
        kind: 'simulate',
        trial: (random) => {
            const [a, b] = [random(), random()].sort((x, y) => x - y);
            return Math.max(a, b - a, 1 - b) < 0.5 ? 1 : 0;
        },
    },
    'hh-against-th': {
        kind: 'simulate',
        trial: (random) => {
            let previous = coin(random);
            for (;;) {
                const next = coin(random);
                if (next && previous) return 1;
                if (next && !previous) return 0;
                previous = next;
            }
        },
    },
    'three-heads-in-a-row': {kind: 'exact', value: () => count(1024, (bits) => /111/.test(bits.toString(2).padStart(10, '0'))) / 1024},
    'positive-test': {kind: 'exact', value: () => {
        // Count a population of a million: who is ill, and whom the test flags.
        const people = 1_000_000;
        const ill = people * 0.01;
        const truePositives = ill * 0.99;
        const falsePositives = (people - ill) * 0.05;
        return truePositives / (truePositives + falsePositives);
    }},

    // ---- expected value --------------------------------------------------------------------
    'one-die-payout': {kind: 'simulate', trial: die},
    'one-reroll': {kind: 'simulate', trial: (random) => {
        const first = die(random);
        return first >= 4 ? first : die(random);
    }},
    'every-face': {kind: 'simulate', trial: (random) => {
        const seen = new Set<number>();
        let rolls = 0;
        while (seen.size < 6) {
            seen.add(die(random));
            rolls++;
        }
        return rolls;
    }},
    'first-six': {kind: 'simulate', trial: (random) => {
        let rolls = 1;
        while (die(random) !== 6) rolls++;
        return rolls;
    }},
    'heads-twice': {kind: 'simulate', trial: (random) => {
        let flips = 0;
        let run = 0;
        while (run < 2) {
            flips++;
            run = coin(random) ? run + 1 : 0;
        }
        return flips;
    }},
    'heads-then-tails': {kind: 'simulate', trial: (random) => {
        let flips = 0;
        let previous = false;
        for (;;) {
            flips++;
            const heads = coin(random);
            if (previous && !heads) return flips;
            previous = heads;
        }
    }},
    'longer-piece': {kind: 'simulate', trial: (random) => {
        const x = random();
        return Math.max(x, 1 - x);
    }},
    'higher-of-two-dice': {kind: 'exact', value: () => {
        let sum = 0;
        for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) sum += Math.max(a, b);
        return sum / 36;
    }},
    'larger-of-two-uniforms': {kind: 'simulate', trial: (random) => Math.max(random(), random())},
    'square-of-a-die': {kind: 'simulate', trial: (random) => die(random) ** 2},
    'cards-to-first-ace': {kind: 'simulate', trials: 200_000, trial: (random) => shuffled(DECK, random).findIndex(isAce) + 1},
    'own-hats': {kind: 'simulate', trial: (random) => {
        const hats = shuffled(Array.from({length: 10}, (_, i) => i), random);
        return hats.filter((hat, person) => hat === person).length;
    }},

    // ---- counting --------------------------------------------------------------------------
    handshakes: {kind: 'exact', value: () => {
        let shakes = 0;
        for (let a = 0; a < 10; a++) for (let b = a + 1; b < 10; b++) shakes++;
        return shakes;
    }},
    'grid-paths': {kind: 'exact', value: () => {
        const ways = Array.from({length: 5}, () => Array(5).fill(0) as number[]);
        for (let x = 0; x <= 4; x++) for (let y = 0; y <= 4; y++) {
            ways[x][y] = x === 0 && y === 0 ? 1 : (x > 0 ? ways[x - 1][y] : 0) + (y > 0 ? ways[x][y - 1] : 0);
        }
        return ways[4][4];
    }},
    'committee-of-three': {kind: 'exact', value: () => count(256, (mask) => mask.toString(2).split('1').length - 1 === 3)},
    'level-anagrams': {kind: 'exact', value: () => new Set(permutations(5).map((perm) => perm.map((i) => 'LEVEL'[i]).join(''))).size},
    'full-houses': {kind: 'exact', value: () => {
        // Every one of the 2,598,960 hands, with rank counts kept as the loops go in and out.
        const counts = new Int8Array(13);
        let distinct = 0;
        const add = (card: number) => { if (counts[card >> 2]++ === 0) distinct++; };
        const drop = (card: number) => { if (--counts[card >> 2] === 0) distinct--; };
        let houses = 0;
        for (let a = 0; a < 52; a++) {
            add(a);
            for (let b = a + 1; b < 52; b++) {
                add(b);
                for (let c = b + 1; c < 52; c++) {
                    add(c);
                    for (let d = c + 1; d < 52; d++) {
                        add(d);
                        for (let e = d + 1; e < 52; e++) {
                            add(e);
                            // Two ranks among five cards is 3 + 2 or 4 + 1; e's rank tells which.
                            if (distinct === 2 && (counts[e >> 2] === 2 || counts[e >> 2] === 3)) houses++;
                            drop(e);
                        }
                        drop(d);
                    }
                    drop(c);
                }
                drop(b);
            }
            drop(a);
        }
        return houses;
    }},
    'wrong-envelopes': {kind: 'exact', value: () => permutations(4).filter((perm) => perm.every((env, letter) => env !== letter)).length},
    'three-dice-ten': {kind: 'exact', value: () => count(216, (i) => (i % 6) + (Math.floor(i / 6) % 6) + Math.floor(i / 36) + 3 === 10)},
    'coins-to-four': {kind: 'exact', value: () => {
        let ways = 0;
        for (let a = 0; a <= 10; a++) for (let b = 0; a + b <= 10; b++) for (let c = 0; a + b + c <= 10; c++) ways++;
        return ways;
    }},
    'round-table': {kind: 'exact', value: () => {
        const seen = new Set<string>();
        for (const perm of permutations(6)) {
            const at = perm.indexOf(0);
            seen.add([...perm.slice(at), ...perm.slice(0, at)].join(','));
        }
        return seen.size;
    }},
    'no-neighbours': {kind: 'exact', value: () => count(1024, (mask) => (mask & (mask >> 1)) === 0)},

    // ---- logic -----------------------------------------------------------------------------
    'hundred-lockers': {kind: 'exact', value: () => {
        const open = new Array<boolean>(101).fill(false);
        for (let student = 1; student <= 100; student++) for (let locker = student; locker <= 100; locker += student) open[locker] = !open[locker];
        return open.filter(Boolean).length;
    }},
    'bat-and-ball': {kind: 'exact', value: () => {
        for (let ball = 0; ball <= 110; ball++) if (ball + (ball + 100) === 110) return ball;
        return NaN;
    }},
    'lily-pads': {kind: 'exact', value: () => {
        let day = 48;
        let covered = 1;
        while (covered > 0.5) {
            covered /= 2;
            day--;
        }
        return day;
    }},
    'widget-machines': {kind: 'exact', value: () => {
        // Each machine makes 5 widgets / 5 machines / 5 minutes = 1/5 widget a minute.
        const perMachinePerMinute = 5 / 5 / 5;
        return 100 / (100 * perMachinePerMinute);
    }},
    'heavier-coin': {kind: 'exact', value: () => {
        // Each weighing has three outcomes, so w weighings tell apart at most 3^w coins.
        let weighings = 0;
        while (3 ** weighings < 9) weighings++;
        return weighings;
    }},
    'clock-hands': {kind: 'exact', value: () => {
        // Scan the day in tiny steps and count the moments the minute hand passes the hour hand.
        let meetings = 1;
        const step = 1 / 3600;
        let gap = 0;
        for (let t = step; t < 24; t += step) {
            const next = (t * 360 * (1 - 1 / 12)) % 360;
            if (next < gap) meetings++;
            gap = next;
        }
        return meetings;
    }},
    'trailing-zeros': {kind: 'exact', value: () => {
        let digits = [1];
        for (let k = 2; k <= 100; k++) digits = bigTimes(digits, k);
        return digits.findIndex((digit) => digit !== 0);
    }},
    'snail-on-a-wall': {kind: 'exact', value: () => {
        let height = 0;
        for (let day = 1; ; day++) {
            height += 3;
            if (height >= 10) return day;
            height -= 2;
        }
    }},
    'four-cards-rule': {kind: 'exact', value: () => {
        // A card needs turning when some hidden side would break "vowel → even".
        type Letter = 'vowel' | 'consonant';
        type Parity = 'even' | 'odd';
        const breaks = (letter: Letter, parity: Parity) => letter === 'vowel' && parity === 'odd';
        const cards: ({letter: Letter} | {parity: Parity})[] = [{letter: 'vowel'}, {letter: 'consonant'}, {parity: 'even'}, {parity: 'odd'}];
        return cards.filter((card) => ('letter' in card
            ? (['even', 'odd'] as const).some((parity) => breaks(card.letter, parity))
            : (['vowel', 'consonant'] as const).some((letter) => breaks(letter, card.parity)))).length;
    }},
    'fly-between-trains': {kind: 'exact', value: () => (100 / (50 + 50)) * 75},

    // ---- estimation ------------------------------------------------------------------------
    'seconds-in-a-year': {kind: 'exact', value: () => 365 * 24 * 60 * 60},
    'doubling-time': {kind: 'exact', value: () => {
        let years = 0;
        let money = 1;
        // Continuous in the year count: find where 1.06^t crosses 2.
        while (money * 1.06 < 2) {
            money *= 1.06;
            years++;
        }
        return years + Math.log(2 / money) / Math.log(1.06);
    }},
    'square-root-2000': {kind: 'exact', value: () => Math.sqrt(2000)},
    'ten-years-at-seven': {kind: 'exact', value: () => {
        let money = 1000;
        for (let year = 0; year < 10; year++) money *= 1.07;
        return money;
    }},
    'compounding-limit': {kind: 'exact', value: () => (1 + 1 / 1e7) ** 1e7},
    'digits-of-two-to-hundred': {kind: 'exact', value: () => {
        let digits = [1];
        for (let k = 0; k < 100; k++) digits = bigTimes(digits, 2);
        return digits.length;
    }},
    'random-walk-spread': {kind: 'exact', value: () => {
        // The exact distribution of the 100-day total, stepped day by day; its spread at the end.
        let table = new Map<number, number>([[0, 1]]);
        for (let day = 0; day < 100; day++) {
            const next = new Map<number, number>();
            for (const [total, p] of table) for (const step of [-1, 1]) next.set(total + step, (next.get(total + step) ?? 0) + p / 2);
            table = next;
        }
        let variance = 0;
        for (const [total, p] of table) variance += p * total * total;
        return Math.sqrt(variance);
    }, within: 1e-9},
    'down-twenty-up': {kind: 'exact', value: () => (100 / 80 - 1) * 100},

    // ---- strategy --------------------------------------------------------------------------
    'take-one-to-three': {kind: 'exact', value: () => {
        const winners = winningMoves<number>(21, (n) => [1, 2, 3].filter((k) => k <= n).map((k) => n - k), String, (n) => n === 0);
        return winners.length === 1 ? 21 - winners[0] : NaN;
    }},
    'two-piles': {kind: 'exact', value: () => {
        type Piles = [number, number];
        const moves = ([a, b]: Piles): Piles[] => [
            ...Array.from({length: a}, (_, k): Piles => [k, b]),
            ...Array.from({length: b}, (_, k): Piles => [a, k]),
        ];
        const winners = winningMoves<Piles>([5, 8], moves, (p) => p.join(','), ([a, b]) => a + b === 0);
        const taken = new Set(winners.map(([a, b]) => 13 - a - b));
        return taken.size === 1 ? [...taken][0] : NaN;
    }},
    'weighted-rock-paper-scissors': {kind: 'exact', value: () => {
        // The row player's payoff (rock, paper, scissors). Solve "rock and paper earn the same as
        // scissors, and the mix sums to 1" by Cramer's rule, then confirm no play earns more.
        const A = [[0, -1, 2], [1, 0, -1], [-2, 1, 0]];
        const M = [
            [A[0][0] - A[2][0], A[0][1] - A[2][1], A[0][2] - A[2][2]],
            [A[1][0] - A[2][0], A[1][1] - A[2][1], A[1][2] - A[2][2]],
            [1, 1, 1],
        ];
        const rhs = [0, 0, 1];
        const det = (m: number[][]) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
            - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
        const mix = [0, 1, 2].map((col) => det(M.map((row, i) => row.map((v, j) => (j === col ? rhs[i] : v)))) / det(M));
        const earns = A.map((row) => row.reduce((sum, v, j) => sum + v * mix[j], 0));
        return mix.every((x) => x >= 0) && earns.every((e) => Math.abs(e) < 1e-12) ? mix[1] : NaN;
    }},
    'kelly-even-money': {kind: 'exact', value: () => {
        let best = 0;
        let bestGrowth = -Infinity;
        for (let f = 0; f < 1; f += 0.0001) {
            const growth = 0.6 * Math.log(1 + f) + 0.4 * Math.log(1 - f);
            if (growth > bestGrowth) {
                bestGrowth = growth;
                best = f;
            }
        }
        return best;
    }, within: 1e-3},
    'keep-or-switch': {kind: 'exact', value: () => {
        let total = 0;
        for (let first = 1; first <= 100; first++) total += first >= 51 ? first : 50.5;
        return total / 100;
    }},
    'three-candidates': {kind: 'exact', value: () => {
        // Ranks 0 (top) to 2; the rule turns away the first and takes the first who outranks all before.
        const orders = permutations(3);
        const hits = orders.filter((order) => {
            const chosen = order.slice(1).find((rank, i) => order.slice(0, i + 1).every((earlier) => rank < earlier));
            return chosen === 0;
        });
        return hits.length / orders.length;
    }},
    'first-heads-wins': {kind: 'simulate', trial: (random) => {
        for (let turn = 0; ; turn++) if (coin(random)) return turn % 2 === 0 ? 1 : 0;
    }},
    'seven-game-series': {kind: 'exact', value: () => count(128, (games) => {
        let a = 0;
        let b = 0;
        for (let g = 0; g < 7; g++) {
            if ((games >> g) & 1) a++;
            else b++;
            if (a === 4 || b === 4) return g === 6;
        }
        return false;
    }) / 128},
};
