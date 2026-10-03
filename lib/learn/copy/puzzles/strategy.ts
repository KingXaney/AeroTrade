// Daily puzzles: games and strategy. See types.ts for the rules every puzzle keeps. Strategies
// are named by what they do ("the play that wins for sure", "the equilibrium mix"), never
// ranked against each other.

import type {PuzzleCopy} from "@/lib/learn/copy/puzzles/types";

export const STRATEGY_PUZZLES: readonly PuzzleCopy[] = [
    {
        id: 'take-one-to-three',
        title: 'Twenty-one counters',
        category: 'strategy',
        difficulty: 2,
        prompt: [
            'A pile has 21 counters. Two players take turns removing 1, 2 or 3; whoever takes the last counter wins.',
            'You move first. How many counters do you take to be sure of winning?',
        ],
        answer: '1',
        unit: 'counters',
        hints: ['Work backwards: a pile of 4 is lost for the player about to move.', 'Every multiple of 4 is a losing pile to move from.'],
        solution: [
            'Take 1 to leave 20. Whatever your opponent takes (k), you take 4 − k, leaving 16, 12, 8, 4 and finally 0.',
            'So the first move that wins for sure takes 1 counter.',
        ],
    },
    {
        id: 'two-piles',
        title: 'Two piles',
        category: 'strategy',
        difficulty: 2,
        prompt: [
            'Two piles hold 5 and 8 coins. Players take turns removing any number of coins from one pile; whoever takes the last coin wins.',
            'You move first. How many coins do you take to be sure of winning?',
        ],
        answer: '3',
        unit: 'coins',
        hints: ['Two equal piles lose for the player about to move: the other player can copy every move.', 'Make the piles equal.'],
        solution: ['Take 3 from the pile of 8, leaving 5 and 5.', 'From then on, copy each move on the other pile; you take the last coin.'],
    },
    {
        id: 'weighted-rock-paper-scissors',
        title: 'Rock pays double',
        category: 'strategy',
        difficulty: 3,
        prompt: [
            'In this rock-paper-scissors, a win with rock (over scissors) collects 2 from the other player; any other win collects 1, and a tie pays nothing.',
            'In the equilibrium, where neither player can gain by changing their mix, what share of the time is paper played?',
        ],
        answer: '1/2',
        hints: ['In an equilibrium mix, each of the three plays earns the same against the other player\'s mix.', 'With mix (r, p, s): rock earns 2s − p, paper r − s, scissors p − 2r. Set them all to zero.'],
        solution: [
            'Paper earns r − s = 0, so r = s; rock earns 2s − p = 0, so p = 2s.',
            'With r + p + s = 1 that gives rock 1/4, paper 1/2, scissors 1/4: doubling rock\'s prize makes paper, the play that wins against rock, twice as common.',
        ],
    },
    {
        id: 'kelly-even-money',
        title: 'Sizing an even-money bet',
        category: 'strategy',
        difficulty: 2,
        prompt: [
            'A bet pays even money and wins 60% of the time. You may stake any fraction of your bankroll each round.',
            'What fraction gives the highest long-run growth rate — the Kelly fraction?',
        ],
        answer: '1/5',
        hints: ['For an even-money bet the Kelly fraction is p − q, the edge.', 'Here p = 0.6 and q = 0.4.'],
        solution: ['The fraction f maximising 0.6 × ln(1 + f) + 0.4 × ln(1 − f) is f = 0.6 − 0.4.', 'That is 0.2: a fifth of the bankroll each round.'],
    },
    {
        id: 'keep-or-switch',
        title: 'Keep or switch',
        category: 'strategy',
        difficulty: 2,
        prompt: [
            'You draw a whole number from 1 to 100, each equally likely. You may keep it, or draw again and keep the second.',
            'You keep the first number when it is 51 or more. What is the expected value of the number you end with?',
        ],
        answer: '63',
        hints: ['Half the time the first number is 51 to 100, averaging 75.5.', 'The other half you take a fresh draw, averaging 50.5.'],
        solution: ['(75.5 + 50.5)/2 = 63.', 'No other threshold does as well: 50 and 52 both give 62.995.'],
    },
    {
        id: 'three-candidates',
        title: 'Three candidates',
        category: 'strategy',
        difficulty: 3,
        prompt: [
            'Three candidates arrive in random order, and you must accept or turn away each one on the spot. You can rank each against those already seen.',
            'Your rule: turn away the first, then accept the first one who outranks everyone before. What is the probability you accept the top-ranked candidate?',
        ],
        answer: '1/2',
        hints: ['List the six orders of ranks 1 (top), 2 and 3.', 'The rule fails when the top candidate comes first, or when the second-ranked one comes second and the top one third.'],
        solution: [
            'Of the six orders, the rule accepts the top candidate in 2-1-3, 2-3-1 and 3-1-2.',
            'That is 3 of 6, so the probability is 1/2 — higher than the 1/3 from accepting at random.',
        ],
    },
    {
        id: 'first-heads-wins',
        title: 'First heads wins',
        category: 'strategy',
        difficulty: 1,
        prompt: ['Two players take turns flipping a fair coin, and the first to flip heads wins.', 'What is the probability that the player who flips first wins?'],
        answer: '2/3',
        hints: ['If both miss, the game is back where it started.', 'Let P be the first player\'s chance: P = 1/2 + (1/4)P.'],
        solution: ['The first player wins now with 1/2, or both miss (1/4) and the game restarts.', 'P = 1/2 + P/4 gives P = 2/3.'],
    },
    {
        id: 'seven-game-series',
        title: 'Going the distance',
        category: 'strategy',
        difficulty: 2,
        prompt: [
            'Two evenly matched teams play until one has won 4 games. Each game is a 50-50 toss-up, independent of the rest.',
            'What is the probability that the series goes all 7 games?',
        ],
        answer: '5/16',
        hints: ['The series reaches game 7 exactly when the first six games split 3-3.', 'Count the ways six games split 3-3.'],
        solution: ['The first six games split 3-3 in C(6, 3) = 20 of 64 equally likely ways.', 'So the probability is 20/64 = 5/16, about 31%.'],
    },
];
