import {describe, expect, it} from 'vitest';
import {topicFeedKey} from '@/lib/topics/feed-key';

const article = (contentHash: number, topicSlug?: string) => (topicSlug ? {contentHash, topicSlug} : {contentHash});

describe('topicFeedKey', () => {
    it('is stable for the same first page, so a refresh that changed nothing keeps "Load more" pages', () => {
        const page = [article(1), article(2), article(3)];
        expect(topicFeedKey(page, 42)).toBe(topicFeedKey([...page.map((a) => ({...a}))], 42));
    });

    it('changes when a refresh brings a newer article to the top', () => {
        expect(topicFeedKey([article(9), article(1), article(2)], 42)).not.toBe(topicFeedKey([article(1), article(2)], 42));
    });

    it('changes when an article further down the page changes', () => {
        expect(topicFeedKey([article(1), article(2), article(3)])).not.toBe(topicFeedKey([article(1), article(2), article(4)]));
    });

    it('changes with the keyword set even when the first page is the same', () => {
        const page = [article(1), article(2)];
        expect(topicFeedKey(page, 42)).not.toBe(topicFeedKey(page, 43));
    });

    it('tells apart the same article brought in by a different topic on the merged feed', () => {
        expect(topicFeedKey([article(1, 'ai-chips')])).not.toBe(topicFeedKey([article(1, 'fed-rates')]));
    });
});
