// The shape of a daily puzzle (lib/learn/copy/puzzles/<category>.ts). The bank is server-only:
// its answers and solutions reach the page only once the reader solves or reveals a puzzle, and
// lib/games/__tests__/puzzle-guard.test.ts fails if a client file imports it.
//
// Every sentence is held to the 'copy' tier of lib/learn/banned.ts. Every probability and
// expected-value answer is checked by simulation, and every count by enumeration, in
// lib/games/__tests__/ — a wrong answer key fails CI.

import type {PuzzleCategory, PuzzleDifficulty} from "@/lib/games/types";

export type PuzzleCopy = {
    // Stored on every attempt row: never renamed, never reused.
    id: string;
    title: string;
    category: PuzzleCategory;
    difficulty: PuzzleDifficulty;
    // One to three sentences.
    prompt: readonly string[];
    // The answer in a notation a reader can type: "1/6", "14.7", "31536000".
    answer: string;
    // An estimate's allowed distance from `answer`, in its own units.
    tolerance?: number;
    unit?: string;
    // Taken one at a time, each a step closer.
    hints: readonly string[];
    solution: readonly string[];
};
