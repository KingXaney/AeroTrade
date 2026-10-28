import {describe, expect, it} from 'vitest';
import {RATING_TARGET_WEIGHTS, RATINGS} from '@/lib/agent-world/config';
import {ratingReason, targetsFromRatings} from '@/lib/agent-world/orders';
import {decodeAgentWorldReason, glossAgentWorldReasons} from '@/lib/learn/agent-world-reasons';
import {findBanned} from '@/lib/learn/banned';

const MECHANISM_ONLY = /\b(works?|worked|working|fails?|failed|beat(s|en|ing)?|outperform\w*|underperform\w*|lags?|lagged)\b/i;

describe('the trading agent world\'s order reasons', () => {
    it('reads back every reason orders.ts can write, at the table\'s weight and scaled down', () => {
        for (const rating of RATINGS) {
            const weight = RATING_TARGET_WEIGHTS[rating];
            if (weight === null) continue;
            for (const target of [weight, weight / 2]) {
                const reason = ratingReason(rating, target);
                const decoded = decodeAgentWorldReason(reason);
                expect(decoded.unknown, reason).toEqual([]);
                expect(decoded.clauses.map((c) => c.term), reason).toEqual(['desk-rating', 'rating-target']);
            }
        }
    });

    it('reads the reasons the allocator\'s targets carry, a scaled one included', () => {
        const symbols = ['A', 'B', 'C', 'D', 'E', 'F'];
        const targets = targetsFromRatings(Object.fromEntries(symbols.map((s) => [s, 'Buy'])), {totalValue: 100_000, cash: 100_000, positions: [], priceBySymbol: Object.fromEntries(symbols.map((s) => [s, 50]))});
        const clauses = glossAgentWorldReasons(targets.flatMap((t) => t.reasons));
        expect(clauses).toHaveLength(symbols.length * 2);
        expect(clauses[1].gloss).toContain('came to 15.8% under the rails');
    });

    it('says the table\'s own weight when nothing scaled it', () => {
        const [rated, target] = decodeAgentWorldReason('rated Buy → target 20%').clauses;
        expect(rated.text).toBe('rated Buy');
        expect(target.gloss).toContain('maps that rating to 20% of the account');
    });

    it('leaves what it does not know unknown, a REVIEW and a stranger alike', () => {
        expect(decodeAgentWorldReason('rated REVIEW → target 0%').unknown).toHaveLength(1);
        expect(decodeAgentWorldReason('exit: hard stop -31% vs cost').unknown).toHaveLength(1);
        expect(decodeAgentWorldReason('').clauses).toEqual([]);
    });

    it('narrates mechanism only, in full sentences, without advice', () => {
        const all = [...RATINGS.filter((r) => RATING_TARGET_WEIGHTS[r] !== null).flatMap((r) => glossAgentWorldReasons([ratingReason(r, RATING_TARGET_WEIGHTS[r] as number), ratingReason(r, 0.01)]))];
        for (const clause of all) {
            expect(clause.gloss.endsWith('.'), clause.gloss).toBe(true);
            expect(findBanned(clause.gloss, 'advice'), clause.gloss).toEqual([]);
            expect(clause.gloss, clause.gloss).not.toMatch(MECHANISM_ONLY);
        }
    });
});
