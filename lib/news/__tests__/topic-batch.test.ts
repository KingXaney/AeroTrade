// Followed topics folded into the news feed. Two properties carry the feature: a story
// the user already gets from a wire must not appear twice because they also follow a
// topic about it, and the topic batch must not be able to swamp the rest of the feed.

import {describe, expect, it} from 'vitest';
import {toFeedArticles} from '@/lib/news/topic-batch';
import {feedUrlKey, mergeFeed, type FeedBatch} from '@/lib/news/feed';
import {FEED_MAX_AGE_SECONDS, hashId} from '@/lib/news/config';

const NOW = 1_700_000_000;

const merged = (over: Partial<MergedTopicArticle> = {}): MergedTopicArticle => ({
    contentHash: 1,
    headline: 'Fed holds rates steady',
    summary: 'The FOMC left the target range unchanged.',
    url: 'https://example.com/fed?utm_source=x',
    source: 'Reuters',
    sourceType: 'web',
    datetime: NOW - 3600,
    score: 9,
    matchedTerms: ['federal reserve'],
    topicId: 't1',
    topicName: 'Fed rate decisions',
    topicSlug: 'fed-rate-decisions',
    topicColor: '#22d3ee',
    ...over,
});

const wire = (url: string, headline: string, datetime = NOW - 3600): MarketNewsArticle => ({
    id: 1, headline, summary: '', source: 'Wire', url, datetime, category: 'general', related: '',
});

describe('toFeedArticles', () => {
    it('is empty for an empty feed', () => {
        expect(toFeedArticles([])).toEqual([]);
    });

    it('carries the topic through so the card can say why the article is there', () => {
        const [article] = toFeedArticles([merged()]);
        expect(article.topic).toEqual({name: 'Fed rate decisions', slug: 'fed-rate-decisions', color: '#22d3ee'});
        expect(article.category).toBe('topic');
        expect(article.headline).toBe('Fed holds rates steady');
        expect(article.source).toBe('Reuters');
        expect(article.datetime).toBe(NOW - 3600);
    });

    it('keys id exactly as mergeFeed re-keys, which is what makes dedupe work', () => {
        const [article] = toFeedArticles([merged()]);
        expect(article.id).toBe(hashId(feedUrlKey('https://example.com/fed?utm_source=x')));
    });

    it('tolerates a topic with no colour', () => {
        expect(toFeedArticles([merged({topicColor: null})])[0].topic?.color).toBeNull();
    });
});

describe('mergeFeed with a topics batch', () => {
    const topicBatch = (articles: MarketNewsArticle[]): FeedBatch => ({kind: 'topics', articles});

    it('does not print a story twice when a wire already carries it', () => {
        const url = 'https://example.com/fed?utm_source=x';
        const batches: FeedBatch[] = [
            topicBatch(toFeedArticles([merged({url})])),
            {kind: 'markets', articles: [wire('https://example.com/fed', 'Fed holds rates steady')]},
        ];
        const out = mergeFeed(batches, {limit: 10, now: NOW});
        expect(out).toHaveLength(1);
        expect(out[0].topic?.slug).toBe('fed-rate-decisions');
    });

    it('drops topic articles older than the feed age cut', () => {
        const stale = toFeedArticles([merged({datetime: NOW - FEED_MAX_AGE_SECONDS - 60})]);
        expect(mergeFeed([topicBatch(stale)], {limit: 10, now: NOW})).toHaveLength(0);
    });

    // The round-robin is what keeps this honest: a full topic queue beside one wire gets
    // half the slots, not all of them, however many topics the user follows.
    it('cannot swamp the rest of the feed', () => {
        const topics = toFeedArticles(
            Array.from({length: 20}, (_, i) => merged({url: `https://example.com/t${i}`, headline: `Topic story ${i}`})),
        );
        const wires = Array.from({length: 20}, (_, i) => wire(`https://example.com/w${i}`, `Wire story ${i}`));
        const out = mergeFeed([topicBatch(topics), {kind: 'markets', articles: wires}], {limit: 10, now: NOW});
        expect(out).toHaveLength(10);
        expect(out.filter((a) => a.topic).length).toBe(5);
    });

    it('leads the rotation when it is first', () => {
        const out = mergeFeed([
            topicBatch(toFeedArticles([merged({url: 'https://example.com/a', headline: 'Topic first'})])),
            {kind: 'markets', articles: [wire('https://example.com/b', 'Wire second')]},
        ], {limit: 10, now: NOW});
        expect(out.map((a) => a.headline)).toEqual(['Topic first', 'Wire second']);
    });
});
