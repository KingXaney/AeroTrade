// The games' shapes that client components may hold: a puzzle as the page shows it before it is
// solved (no answer, no solution, no hints the reader has not asked for) and the reader's
// progress on it. Import-free, so a client bundle never pulls the puzzle bank in through a type.

export type PuzzleCategory = 'probability' | 'expected-value' | 'combinatorics' | 'logic' | 'estimation' | 'strategy';

export type PuzzleDifficulty = 1 | 2 | 3;

export type PuzzleView = {
    id: string;
    // "#12": the day's number for today's puzzle, the first day's number in the archive.
    number: number;
    title: string;
    category: PuzzleCategory;
    difficulty: PuzzleDifficulty;
    prompt: readonly string[];
    // Printed beside the answer box: "cents", "%", "minutes".
    unit?: string;
    // An estimate accepts anything within a tolerance; its "close" means outside it.
    estimate?: true;
    hintCount: number;
};

export type PuzzleStatus = 'open' | 'solved' | 'revealed';

export type PuzzleProgress = {
    // null until the reader first answers or takes a hint.
    status: PuzzleStatus | null;
    attempts: number;
    // The hints taken so far, in order.
    hints: readonly string[];
    // ISO instant of the solve.
    solvedAt: string | null;
    // Sent only once the puzzle is solved or revealed.
    answer: string | null;
    solution: readonly string[] | null;
};
