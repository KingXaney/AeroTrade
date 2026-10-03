// The 169 classes from the highest equity against a random hand to the lowest, read from
// lib/poker/data/preflop-ranking.json, which scripts/poker-preflop-equity.mjs writes beside the table:
// what the range editor's "Top x%" takes, without loading the table itself. Pure.

import file from "@/lib/poker/data/preflop-ranking.json";

export const PREFLOP_RANKING: readonly number[] = file.ranking;
