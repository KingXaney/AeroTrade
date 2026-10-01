// The catalog's cadences in words — the one map, in two lengths. `short` fills one cell: the
// leaderboard's family line and StrategyExplainer's "Checks" row. `long` is the strategy detail
// header's meta line, where the cadence stands on its own beside the family. The test holds both to
// the 'copy' tier of lib/learn/banned.ts — which is why the short 'once' is not the leaderboard's
// old 'buy once': read alone, that is an imperative.

import type {Cadence} from "@/lib/strategies/types";

export const CADENCE_COPY = {
    short: {once: 'once', daily: 'daily', monthly: 'monthly', quarterly: 'quarterly'},
    long: {once: 'buys once', daily: 'checked daily', monthly: 'rebalances monthly', quarterly: 'rebalances quarterly'},
} as const satisfies Record<'short' | 'long', Record<Cadence, string>>;
