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
    });

    // Known and reported, not reworded: banned.ts drops a clause only when it opens with a
    // prohibition word, and "none" is not one, so the disclaimer is caught by the very word it
    // disclaims. Pinned so that either fix — new wording, or "none" taught to PROHIBITION —
    // turns this test red and moves the note into the clean list above.
    it('flags the page note on the word it disclaims', () => {
        expect(findBanned(LEARN_PAGE_COPY.note, 'copy')).toEqual(['recommendation']);
    });
});

describe('TOPIC_BRIEF_COPY', () => {
    it('dates the caveat in a list and never advises', () => {
        expect(TOPIC_BRIEF_COPY.datedCaveat('2026-10-01')).toBe('2026-10-01 · AI summary · may contain errors');
        for (const text of [TOPIC_BRIEF_COPY.caveat, TOPIC_BRIEF_COPY.datedCaveat('2026-10-01'), TOPIC_BRIEF_COPY.firstBrief]) clean(text);
    });
});
