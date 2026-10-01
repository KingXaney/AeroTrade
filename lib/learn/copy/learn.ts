// Copy for the /learn page's frame: its title lines and the heading over the strategies'
// one-line summaries. The definitions themselves are lib/learn/glossary.ts and the strategy
// lines are the catalog's, and so is their count; the test holds these to the 'copy' tier of
// lib/learn/banned.ts.

import {STRATEGIES} from "@/lib/strategies/catalog";
import {numberWord} from "@/lib/text";

export const LEARN_PAGE_COPY = {
    subtitle: 'What every number in AeroTrade measures, in the app\'s own words — and where to see the real one on your account.',
    note: 'Definitions describe; none of them is a recommendation.',
    strategiesHeading: `The ${numberWord(STRATEGIES.length)} strategies, one line each`,
} as const;
