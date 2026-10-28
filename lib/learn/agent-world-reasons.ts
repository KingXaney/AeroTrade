// The trading agent world's half of the reason decoder (lib/learn/reasons.ts has the strategies'
// and the Navigator's, lib/learn/culture-reasons.ts the pickers'): the one string shape
// lib/agent-world/orders.ts writes on an order, "rated <rating> → target <n>%", read clause by
// clause and glossed from lib/agent-world/config.ts, so a moved constant moves the prose. Pure; it
// never builds a RegExp from its input, and a string it does not know comes back as `unknown`
// (lib/learn/__tests__/agent-world-reasons.test.ts round-trips every reason orders.ts can write).

import {AGENT_WORLD_RAILS, RATING_TARGET_WEIGHTS, RATINGS, type Rating} from '@/lib/agent-world/config';
import {AGENT_WORLD_GLOSS} from '@/lib/learn/copy/agent-world';
import {anchored, decodeGuarded, decodeWith, type DecodedReason, type ReasonClause, type ReasonTemplate} from '@/lib/learn/reasons';

const pct = (fraction: number): string => `${Number((fraction * 100).toFixed(1))}%`;
// The words a rating can be in an order's reason: every rating that moves a book.
const WORDS = RATINGS.filter((rating) => RATING_TARGET_WEIGHTS[rating] !== null).join('|');

export const AGENT_WORLD_GRAMMAR: readonly ReasonTemplate[] = [
    {
        id: 'agent-world-rating',
        pattern: anchored(`rated (${WORDS}) → target (\\d+(?:\\.\\d+)?)%`),
        decode: (match) => {
            const rating = match[1] as Rating;
            const table = RATING_TARGET_WEIGHTS[rating];
            if (table === null) return null;
            const target = Number(match[2]) / 100;
            // The table's weight as the rails let it stand alone (capped at one name's share).
            const own = Math.min(table, AGENT_WORLD_RAILS.maxPositionWeight);
            return [
                {text: `rated ${rating}`, gloss: AGENT_WORLD_GLOSS.rated(rating), term: 'desk-rating'},
                {
                    text: `target ${match[2]}%`,
                    gloss: Math.abs(target - own) < 0.0005 && own === table ? AGENT_WORLD_GLOSS.target(pct(table)) : AGENT_WORLD_GLOSS.scaled(pct(target), pct(table)),
                    term: 'rating-target',
                },
            ];
        },
    },
];

export const decodeAgentWorldReason = (reason: string): DecodedReason =>
    decodeGuarded(reason, (text) => decodeWith(AGENT_WORLD_GRAMMAR, text, undefined));

// Every clause of every reason given, in order: what the page hands an order's "What the rule saw".
export const glossAgentWorldReasons = (reasons: readonly string[]): ReasonClause[] =>
    reasons.flatMap((reason) => decodeAgentWorldReason(reason).clauses);
