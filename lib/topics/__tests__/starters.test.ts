import {describe, expect, it} from 'vitest';
import {
    DEFAULT_TOPIC_NAMES,
    STARTER_TOPICS,
    defaultTopicSlugs,
    defaultTopics,
    isUntouchedDefaultSet,
} from '@/lib/topics/starters';
import {KEYWORD_MAX, KEYWORD_MIN, MAX_KEYWORDS, MAX_TOPICS_PER_USER, NAME_MAX} from '@/lib/topics/config';
import {normalizeKeywordList, slugify} from '@/lib/topics/normalize';

describe('STARTER_TOPICS', () => {
    // The file header promises normalizeKeywordList drops nothing. It re-sorts, so this
    // compares sets — an unnormalised keyword would be silently dropped, not reordered.
    it('keywords survive normalizeKeywordList with nothing dropped', () => {
        for (const topic of STARTER_TOPICS) {
            const normalized = normalizeKeywordList(topic.keywords, MAX_KEYWORDS);
            expect(normalized.length, topic.name).toBe(topic.keywords.length);
            expect(new Set(normalized), topic.name).toEqual(new Set(topic.keywords));
        }
    });

    it('stays inside the caps the validator enforces', () => {
        for (const topic of STARTER_TOPICS) {
            expect(topic.keywords.length, topic.name).toBeLessThanOrEqual(MAX_KEYWORDS);
            expect(topic.name.length, topic.name).toBeLessThanOrEqual(NAME_MAX);
            for (const keyword of topic.keywords) {
                expect(keyword.length, keyword).toBeGreaterThanOrEqual(KEYWORD_MIN);
                expect(keyword.length, keyword).toBeLessThanOrEqual(KEYWORD_MAX);
            }
        }
    });

    it('has unique names and unique slugs', () => {
        const names = STARTER_TOPICS.map((t) => t.name);
        const slugs = STARTER_TOPICS.map((t) => slugify(t.name));
        expect(new Set(names).size).toBe(names.length);
        expect(new Set(slugs).size).toBe(slugs.length);
    });

    // A bare 'war' would match "price war" and "bidding war" under whole-word matching.
    it('carries no keyword so broad it would match unrelated business copy', () => {
        const tooBroad = new Set(['war', 'news', 'market', 'stocks', 'economy', 'trade']);
        for (const topic of STARTER_TOPICS) {
            for (const keyword of topic.keywords) expect(tooBroad.has(keyword), keyword).toBe(false);
        }
    });
});

describe('defaultTopics', () => {
    it('resolves every name in DEFAULT_TOPIC_NAMES', () => {
        expect(defaultTopics()).toHaveLength(DEFAULT_TOPIC_NAMES.length);
        expect(defaultTopics().map((t) => t.name)).toEqual([...DEFAULT_TOPIC_NAMES]);
    });

    it('leaves the user room of their own under the cap', () => {
        expect(DEFAULT_TOPIC_NAMES.length).toBeLessThan(MAX_TOPICS_PER_USER);
        expect(MAX_TOPICS_PER_USER - DEFAULT_TOPIC_NAMES.length).toBeGreaterThanOrEqual(8);
    });

    // The user asked for finance-first with major world news in it, so assert both.
    it('is finance-led but carries world news', () => {
        const groups = defaultTopics().map((t) => t.group);
        expect(groups.filter((g) => g === 'world').length).toBeGreaterThanOrEqual(2);
        expect(groups.filter((g) => g === 'finance').length).toBeGreaterThan(groups.filter((g) => g === 'world').length);
    });
});

describe('isUntouchedDefaultSet', () => {
    const slugs = defaultTopicSlugs();

    it('holds for exactly the default slugs, in any order', () => {
        expect(isUntouchedDefaultSet(slugs)).toBe(true);
        expect(isUntouchedDefaultSet([...slugs].reverse())).toBe(true);
    });

    it('breaks on a removal, an addition or a rename', () => {
        expect(isUntouchedDefaultSet(slugs.slice(1))).toBe(false);
        expect(isUntouchedDefaultSet([...slugs, 'my-own-topic'])).toBe(false);
        expect(isUntouchedDefaultSet([...slugs.slice(1), 'fed-rate-decisions-v2'])).toBe(false);
    });

    it('is false for an empty set, so the notice never shows on an empty page', () => {
        expect(isUntouchedDefaultSet([])).toBe(false);
    });
});
