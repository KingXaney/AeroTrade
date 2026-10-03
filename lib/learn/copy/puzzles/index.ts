// The daily-puzzle bank and its schedule. Server-only (see types.ts): pages and actions read it
// through lib/games/puzzles.ts, and client components get a puzzle's prompt, never its answer.
//
// PUZZLE_SCHEDULE is the order the days walk through, one puzzle a day from
// lib/games/puzzles.PUZZLES_START_DATE, cycling when it runs out. It is append-only: a puzzle
// added at the end is shown when its day comes, and a reorder would move puzzles between days
// already shown (lib/games/__tests__/puzzles.test.ts pins the order). The categories take turns,
// and the puzzles get harder as the weeks go on.

import {COMBINATORICS_PUZZLES} from "@/lib/learn/copy/puzzles/combinatorics";
import {ESTIMATION_PUZZLES} from "@/lib/learn/copy/puzzles/estimation";
import {EXPECTED_VALUE_PUZZLES} from "@/lib/learn/copy/puzzles/expected-value";
import {LOGIC_PUZZLES} from "@/lib/learn/copy/puzzles/logic";
import {PROBABILITY_PUZZLES} from "@/lib/learn/copy/puzzles/probability";
import {STRATEGY_PUZZLES} from "@/lib/learn/copy/puzzles/strategy";
import type {PuzzleCopy} from "@/lib/learn/copy/puzzles/types";

export const PUZZLE_BANK: readonly PuzzleCopy[] = [
    ...PROBABILITY_PUZZLES,
    ...EXPECTED_VALUE_PUZZLES,
    ...COMBINATORICS_PUZZLES,
    ...LOGIC_PUZZLES,
    ...ESTIMATION_PUZZLES,
    ...STRATEGY_PUZZLES,
];

export const PUZZLE_SCHEDULE: readonly string[] = [
    'bat-and-ball', 'two-dice-seven', 'one-die-payout', 'handshakes', 'down-twenty-up', 'first-heads-wins',
    'lily-pads', 'matching-socks', 'first-six', 'grid-paths', 'seconds-in-a-year', 'take-one-to-three',
    'widget-machines', 'at-least-one-six', 'square-of-a-die', 'committee-of-three', 'doubling-time', 'two-piles',
    'snail-on-a-wall', 'three-doors', 'one-reroll', 'level-anagrams', 'random-walk-spread', 'kelly-even-money',
    'fly-between-trains', 'two-children', 'heads-then-tails', 'round-table', 'square-root-2000', 'seven-game-series',
    'hundred-lockers', 'three-cards', 'heads-twice', 'full-houses', 'ten-years-at-seven', 'keep-or-switch',
    'heavier-coin', 'positive-test', 'longer-piece', 'wrong-envelopes', 'digits-of-two-to-hundred', 'weighted-rock-paper-scissors',
    'clock-hands', 'shared-birthday', 'higher-of-two-dice', 'three-dice-ten', 'compounding-limit', 'three-candidates',
    'trailing-zeros', 'after-the-first-ace', 'larger-of-two-uniforms', 'coins-to-four', 'four-cards-rule', 'broken-stick',
    'every-face', 'no-neighbours', 'hh-against-th', 'own-hats', 'three-heads-in-a-row', 'cards-to-first-ace',
];

export type {PuzzleCopy} from "@/lib/learn/copy/puzzles/types";
