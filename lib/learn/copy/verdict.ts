// Copy for Guess the Verdict. What each verdict means is said once, in plain words;
// the reveal quotes the rule's own stored reason wherever one exists.

import type {RowState} from "@/lib/strategies/types";

export const STATE_MEANING: Record<RowState, string> = {
    held: 'The rule already owns it and nothing today told it to let go.',
    enter: 'Its entry condition was true today and the rule had room for one more position.',
    exit: 'The rule owns it and its exit condition was true today.',
    watch: 'In the universe but not owned: the entry condition was not met, or every position was already taken.',
    excluded: 'Not eligible today, usually for lack of enough price history or a fresh bar.',
};

// The verdicts a reader is asked to call; 'excluded' is a data fact, not a decision.
export const ASKABLE_STATES: readonly RowState[] = ['enter', 'exit', 'held', 'watch'];

export const VERDICT_QUIZ_COPY = {
    summary: 'Try it — call the verdicts yourself',
    intro: 'For each row, pick what the rule decided this morning, then reveal the stored verdict and the reason it gave.',
    reveal: 'Reveal',
    tally: (matched: number, guessed: number): string => `${matched} of ${guessed} matched the rule`,
    matched: 'matched',
    missed: 'not this time',
    unanswered: 'no guess',
};
