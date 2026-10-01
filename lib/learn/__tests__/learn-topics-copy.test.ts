// The /learn page's frame (lib/learn/copy/learn.ts) and a topic brief's caveat and
// placeholder (lib/learn/copy/topics.ts), held to the 'copy' tier of lib/learn/banned.ts.

import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {LEARN_PAGE_COPY} from '@/lib/learn/copy/learn';
import {TOPIC_BRIEF_COPY} from '@/lib/learn/copy/topics';

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
