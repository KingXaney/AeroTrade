import {describe, expect, it} from 'vitest';
import {BANNED_ADVICE, BANNED_COPY, findBanned, stripProhibitions} from '@/lib/learn/banned';

describe('findBanned', () => {
    it('flags a valuation verdict', () => {
        expect(findBanned('a low P/E is cheap', 'advice')).toEqual(['cheap']);
    });

    it('flags instructions about money in any voice', () => {
        expect(findBanned('You should sell before earnings.', 'advice').length).toBeGreaterThan(0);
        expect(findBanned('Should I add NVDA?', 'advice').length).toBeGreaterThan(0);
        expect(findBanned('We recommend adding it.', 'advice')).toContain('recommend');
        expect(findBanned('Diversify your holdings.', 'advice')).toEqual(['diversify']);
    });

    it('ignores a prohibition, however it is punctuated', () => {
        expect(findBanned('Never recommend a stock.', 'advice')).toEqual([]);
        expect(findBanned('- **Never predict future prices.** Offer the quote instead.', 'advice')).toEqual([]);
        expect(findBanned("1. Don't call a stock cheap or expensive.", 'advice')).toEqual([]);
        expect(findBanned('No fee is charged; no price target is set.', 'copy')).toEqual([]);
    });

    it('is case-insensitive and reports each phrase once', () => {
        expect(findBanned('CHEAP now, cheap later, Cheap always', 'advice')).toEqual(['cheap']);
    });

    it('lets narration of what a rule did pass the advice tier', () => {
        const gloss = 'The rule sells the whole position when the close falls below the 20-day low.';
        expect(findBanned(gloss, 'advice')).toEqual([]);
        expect(findBanned(gloss, 'copy')).toEqual([]);
    });

    it('holds learner copy to the stricter tier', () => {
        expect(findBanned('Each bullet should be short.', 'advice')).toEqual([]);
        expect(findBanned('Each bullet should be short.', 'copy')).toEqual(['should']);
        expect(findBanned('This setting is better.', 'copy')).toEqual(['better']);
        expect(findBanned('Your account beat 62% of them.', 'copy')).toEqual(['beat']);
        expect(findBanned('Your account landed above 62% of them.', 'copy')).toEqual([]);
    });

    it('separates an imperative from a description', () => {
        expect(findBanned('Buy the dip in a strong stock, sell the bounce, repeat.', 'copy').length).toBeGreaterThan(0);
        expect(findBanned('Buys a strong stock on a two-day dip and sells the bounce.', 'copy')).toEqual([]);
        expect(findBanned('what people mean when they call a business diversified', 'copy')).toEqual([]);
    });

    it('keeps the two tiers as real lists', () => {
        expect(BANNED_ADVICE.length).toBeGreaterThan(10);
        expect(BANNED_COPY.length).toBeGreaterThan(3);
        expect(stripProhibitions('Never do this. Always do that.')).toBe('Always do that.');
    });
});
