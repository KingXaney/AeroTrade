// Copy for the per-fill "What the rule saw" disclosure.

import {STRATEGY_RUN_TTL_DAYS} from "@/lib/strategies/config";

export const REPLAY_COPY = {
    summary: 'What the rule saw',
    caption: (asOf: string): string => `The board row the rule looked at, from the ${asOf} close`,
    expired: `Decision record expired — boards are kept ${STRATEGY_RUN_TTL_DAYS} days`,
    missing: 'No board stored for this fill',
    plannedOrder: 'Planned order',
};
