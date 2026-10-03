// The /learn page's frame (lib/learn/copy/learn.ts) and the topics pages' copy (lib/learn/copy/topics.ts):
// a topic brief's caveat and placeholder, the starter chips and the manage view, held to the 'copy'
// tier of lib/learn/banned.ts.

import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {LEARN_PAGE_COPY} from '@/lib/learn/copy/learn';
import {TOPIC_BRIEF_COPY, TOPIC_PICKER_COPY, TOPICS_MANAGE_COPY} from '@/lib/learn/copy/topics';

const clean = (text: string) => {
    expect(text, text).not.toMatch(/undefined|NaN|null|\[object|Infinity/);
    expect(findBanned(text, 'copy'), text).toEqual([]);
};

describe('LEARN_PAGE_COPY', () => {
    it('never advises', () => {
        clean(LEARN_PAGE_COPY.subtitle);
        clean(LEARN_PAGE_COPY.strategiesHeading);
        // The disclaimer's second sentence opens with "No", a prohibition banned.ts drops,
        // so the note can name the word it disclaims.
        clean(LEARN_PAGE_COPY.note);
    });
});

describe('TOPIC_BRIEF_COPY', () => {
    it('dates the caveat in a list and never advises', () => {
        expect(TOPIC_BRIEF_COPY.datedCaveat('2026-10-01')).toBe('2026-10-01 · AI summary · may contain errors');
        for (const text of [TOPIC_BRIEF_COPY.caveat, TOPIC_BRIEF_COPY.datedCaveat('2026-10-01'), TOPIC_BRIEF_COPY.firstBrief]) clean(text);
    });
});

describe('TOPIC_PICKER_COPY', () => {
    it('names the groups and counts the selection, never advising', () => {
        expect(TOPIC_PICKER_COPY.followSelected(2)).toBe('Follow 2 selected');
        expect(TOPIC_PICKER_COPY.followSelected(0)).toBe('Follow selected');
        expect(TOPIC_PICKER_COPY.following(1)).toBe('Following 1 topic');
        expect(TOPIC_PICKER_COPY.following(3)).toBe('Following 3 topics');
        for (const text of [
            ...Object.values(TOPIC_PICKER_COPY.groups),
            TOPIC_PICKER_COPY.followSelected(0),
            TOPIC_PICKER_COPY.followSelected(2),
            TOPIC_PICKER_COPY.following(1),
            TOPIC_PICKER_COPY.following(3),
        ]) clean(text);
    });
});

describe('TOPICS_MANAGE_COPY', () => {
    const FIVE_TERMS = ['federal reserve', 'fomc', 'fed funds rate', 'rate cut', 'rate hike'];

    it('counts, lists and toasts without advising', () => {
        for (const value of Object.values(TOPICS_MANAGE_COPY)) if (typeof value === 'string') clean(value);
        for (const text of [
            TOPICS_MANAGE_COPY.followedOf(6, 16),
            TOPICS_MANAGE_COPY.keywordLine(FIVE_TERMS, []),
            TOPICS_MANAGE_COPY.keywordLine(['nvidia'], ['crypto']),
            TOPICS_MANAGE_COPY.newCount(3),
            TOPICS_MANAGE_COPY.editRow('AI chips'),
            TOPICS_MANAGE_COPY.removeRow('AI chips'),
            TOPICS_MANAGE_COPY.removed('AI chips'),
            TOPICS_MANAGE_COPY.restored('AI chips'),
            TOPICS_MANAGE_COPY.roomFor(1),
            TOPICS_MANAGE_COPY.roomFor(2),
            TOPICS_MANAGE_COPY.atCap(16),
        ]) clean(text);
    });

    it('reads the count, the keyword line and the cap exactly', () => {
        expect(TOPICS_MANAGE_COPY.followedOf(6, 16)).toBe('6 of 16 followed');
        expect(TOPICS_MANAGE_COPY.keywordLine(FIVE_TERMS, [])).toBe('federal reserve · fomc · fed funds rate · +2 more');
        expect(TOPICS_MANAGE_COPY.keywordLine(['nvidia'], ['crypto'])).toBe('nvidia · 1 excluded');
        expect(TOPICS_MANAGE_COPY.keywordLine(['a', 'b'], ['c', 'd'])).toBe('a · b · 2 excluded');
        expect(TOPICS_MANAGE_COPY.newCount(3)).toBe('3 new');
        expect(TOPICS_MANAGE_COPY.removeRow('AI chips')).toBe('Remove AI chips');
        expect(TOPICS_MANAGE_COPY.removed('AI chips')).toBe('Stopped following "AI chips"');
        expect(TOPICS_MANAGE_COPY.restored('AI chips')).toBe('Following "AI chips" again');
        expect(TOPICS_MANAGE_COPY.roomFor(1)).toBe('Room for 1 more topic.');
        expect(TOPICS_MANAGE_COPY.atCap(16)).toBe('You follow 16 of 16 topics. Remove one to add another.');
    });

    // scripts/qa/qa-topics.mjs finds the overview's notice by this phrase.
    it('keeps the preinstalled notice the QA suite matches', () => {
        expect(TOPICS_MANAGE_COPY.preinstalled).toMatch(/came preinstalled/i);
    });

    // Playwright's getByRole name match is a substring: a new control whose name contains one of
    // the labels the QA suites pin would be found in their place.
    it('gives no control a name the QA suites already pin', () => {
        const pinned = /edit keywords|stop following|refresh now|follow a topic|write my own|topic actions/i;
        for (const label of [
            TOPICS_MANAGE_COPY.edit,
            TOPICS_MANAGE_COPY.remove,
            TOPICS_MANAGE_COPY.done,
            TOPICS_MANAGE_COPY.addOwn,
            TOPICS_MANAGE_COPY.editTopics,
            TOPICS_MANAGE_COPY.undo,
            TOPICS_MANAGE_COPY.editRow('AI chips'),
            TOPICS_MANAGE_COPY.removeRow('AI chips'),
            TOPIC_PICKER_COPY.followSelected(2),
            TOPIC_PICKER_COPY.followSelected(0),
        ]) expect(pinned.test(label), label).toBe(false);
    });
});
