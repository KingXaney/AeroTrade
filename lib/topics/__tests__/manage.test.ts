// The manage view's pure layer (lib/topics/manage): what the picker offers, the cap's slots, the
// chip selection and the input Undo re-creates a removed topic from.

import {describe, expect, it} from 'vitest';
import {OFFER_GROUPS, offeredTopics, slotsLeft, toFollowInputs, toggleSelection, topicToInput} from '@/lib/topics/manage';
import {MAX_TOPICS_PER_USER} from '@/lib/topics/config';
import {slugify, topicInputSchema} from '@/lib/topics/normalize';
import {STARTER_TOPICS, defaultTopicSlugs} from '@/lib/topics/starters';

const BRAIN = [
    {name: 'AI chips', keywords: ['nvidia']},          // a starter's duplicate
    {name: 'Rate cuts', keywords: ['rate cut']},
];

describe('offeredTopics', () => {
    it('offers every starter in list order, keyed by its slug, when nothing is followed', () => {
        const offers = offeredTopics([], []);
        expect(offers).toHaveLength(STARTER_TOPICS.length);
        expect(offers.map((o) => o.name)).toEqual(STARTER_TOPICS.map((t) => t.name));
        for (const offer of offers) {
            expect(offer.slug, offer.name).toBe(slugify(offer.name));
            expect(['finance', 'world'], offer.name).toContain(offer.group);
        }
    });

    it('hides the followed defaults, leaving the five unfollowed starters by name', () => {
        expect(offeredTopics(defaultTopicSlugs(), []).map((o) => o.name))
            .toEqual(['Big Tech earnings', 'Electric vehicles', 'Crypto regulation', 'Housing market', 'US elections']);
    });

    it('appends the brain’s suggestions after the starters, a starter winning a duplicate', () => {
        const offers = offeredTopics([], BRAIN);
        expect(offers.filter((o) => o.slug === 'ai-chips')).toHaveLength(1);
        expect(offers.find((o) => o.slug === 'ai-chips')?.group).toBe('finance');
        expect(offers.at(-1)).toEqual({name: 'Rate cuts', keywords: ['rate cut'], slug: 'rate-cuts', group: 'brain'});
    });

    it('hides a brain suggestion the reader already follows', () => {
        expect(offeredTopics(['rate-cuts'], BRAIN).some((o) => o.slug === 'rate-cuts')).toBe(false);
    });

    it('keeps the first of two brain items that share a slug', () => {
        const offers = offeredTopics([], [{name: 'Rate cuts', keywords: ['rate cut']}, {name: 'Rate Cuts', keywords: ['cuts']}]);
        const rateCuts = offers.filter((o) => o.slug === 'rate-cuts');
        expect(rateCuts).toHaveLength(1);
        expect(rateCuts[0].keywords).toEqual(['rate cut']);
    });

    it('draws the groups starters first, then the brain', () => {
        expect(OFFER_GROUPS).toEqual(['finance', 'world', 'brain']);
    });
});

describe('slotsLeft', () => {
    it('counts down to the cap and never below zero', () => {
        expect(slotsLeft(6)).toBe(MAX_TOPICS_PER_USER - 6);
        expect(slotsLeft(MAX_TOPICS_PER_USER)).toBe(0);
        expect(slotsLeft(MAX_TOPICS_PER_USER + 1)).toBe(0);
        expect(slotsLeft(0, 4)).toBe(4);
    });
});

describe('toggleSelection', () => {
    it('adds a chip while a slot is open', () => {
        expect(toggleSelection(new Set(), 'a', 2)).toEqual({next: new Set(['a']), blocked: false});
    });

    it('refuses a chip past the open slots and hands the selection back unchanged', () => {
        const selected = new Set(['a', 'b']);
        const result = toggleSelection(selected, 'c', 2);
        expect(result.blocked).toBe(true);
        expect(result.next).toBe(selected);
        expect(toggleSelection(new Set(), 'a', 0)).toEqual({next: new Set(), blocked: true});
    });

    it('always lets a selected chip go, even at the cap', () => {
        const selected = new Set(['a', 'b']);
        expect(toggleSelection(selected, 'a', 2)).toEqual({next: new Set(['b']), blocked: false});
        expect(selected.has('a'), 'the input set is untouched').toBe(true);
    });
});

describe('toFollowInputs', () => {
    it('turns the selected offers into the inputs followStarterTopics takes, in offer order', () => {
        const offers = offeredTopics([], []);
        const inputs = toFollowInputs(offers, new Set(['us-elections', 'housing-market']));
        const housing = STARTER_TOPICS.find((t) => t.name === 'Housing market');
        const elections = STARTER_TOPICS.find((t) => t.name === 'US elections');
        expect(inputs).toEqual([
            {name: 'Housing market', keywords: housing?.keywords, exclude: []},
            {name: 'US elections', keywords: elections?.keywords, exclude: []},
        ]);
    });

    it('drops a selected slug that is no longer offered', () => {
        expect(toFollowInputs(offeredTopics([], []), new Set(['followed-meanwhile']))).toEqual([]);
    });
});

describe('topicToInput', () => {
    it('keeps the name, keywords, exclusions and colour, a null colour becoming absent', () => {
        expect(topicToInput({name: 'X', keywords: ['x'], exclude: ['y'], color: null}))
            .toEqual({name: 'X', keywords: ['x'], exclude: ['y'], color: undefined});
        expect(topicToInput({name: 'X', keywords: ['x'], exclude: [], color: '#ff0000'}).color).toBe('#ff0000');
    });

    it('is a valid topic input, so Undo’s re-create is never refused for its shape', () => {
        for (const color of [null, '#ff0000']) {
            const input = topicToInput({name: 'Fed rate decisions', keywords: ['federal reserve', 'fomc'], exclude: ['ecb'], color});
            expect(topicInputSchema.safeParse(input).success, String(color)).toBe(true);
        }
    });
});
