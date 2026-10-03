// What each verdict on a signal board means, said once in plain words. The board's reading
// (lib/strategies/learn/board-narration.ts) quotes it for a row it cannot read from numbers.

import type {RowState} from "@/lib/strategies/types";

export const STATE_MEANING: Record<RowState, string> = {
    held: 'The rule already owns it and nothing today told it to let go.',
    enter: 'Its entry condition was true today and the rule had room for one more position.',
    exit: 'The rule owns it and its exit condition was true today.',
    watch: 'In the universe but not owned: the entry condition was not met, or every position was already taken.',
    excluded: 'Not eligible today, usually for lack of enough price history or a fresh bar.',
};
