import {describe, expect, it} from 'vitest';
import {REPEAT_SENTIMENT_SHARE, REPEAT_SIMILARITY} from '@/lib/brain/config';
import {headlineTokens, headlineSimilarity, repeatedMentions} from '@/lib/brain/novelty';

const fold = (headline: string, keys: string[], datetime: number) => ({headline, datetime, entities: keys.map((key) => ({key}))});

describe('headlineTokens', () => {
    it('keeps the words that carry a story, lower-cased, without the small ones', () => {
        expect([...headlineTokens("Nvidia's Q3 Beats Estimates, Shares Rise 3% — Reuters")].sort())
            .toEqual(['3%', 'beats', 'estimates', 'nvidia', 'q3', 'reuters', 'rise', 'shares'].sort());
        expect(headlineTokens('')).toEqual(new Set());
    });
});

describe('headlineSimilarity', () => {
    it('is high for one story syndicated under two headlines, low for two stories about one company', () => {
        expect(headlineSimilarity('Nvidia beats estimates, shares rise', 'Nvidia beats estimates; shares rise 3%')).toBeGreaterThanOrEqual(REPEAT_SIMILARITY);
        expect(headlineSimilarity('Nvidia unveils a new data-centre chip', 'Nvidia beats estimates, shares rise')).toBeLessThan(REPEAT_SIMILARITY);
    });

    it('is zero when either headline has no words to compare', () => {
        expect(headlineSimilarity('', 'Nvidia beats estimates')).toBe(0);
    });
});

describe('repeatedMentions', () => {
    it("marks the later copy's shared names, leaving the first published one its tone", () => {
        const run = [
            fold('Nvidia beats estimates; shares rise 3%', ['NVDA', 'theme:ai-capex'], 200),
            fold('Nvidia beats estimates, shares rise', ['NVDA', 'sector:technology'], 100),
            fold('Apple delays its headset', ['AAPL'], 150),
        ];
        const repeats = repeatedMentions(run);
        // The second article was published first: the first one in the list is the repeat.
        expect([...repeats[0]]).toEqual(['NVDA']);
        expect(repeats[1].size).toBe(0);
        expect(repeats[2].size).toBe(0);
    });

    it('needs a shared name: two near-identical headlines about different names are two stories', () => {
        const repeats = repeatedMentions([fold('Shares rise after results beat estimates', ['MSFT'], 1), fold('Shares rise after results beat estimates', ['AMZN'], 2)]);
        expect(repeats.every((set) => set.size === 0)).toBe(true);
    });

    it('treats an article without a headline as new', () => {
        const repeats = repeatedMentions([{datetime: 1, entities: [{key: 'NVDA'}]}, {datetime: 2, entities: [{key: 'NVDA'}]}]);
        expect(repeats.every((set) => set.size === 0)).toBe(true);
    });

    it('takes the whole tone out of a repeat', () => {
        expect(REPEAT_SENTIMENT_SHARE).toBe(0);
    });
});
