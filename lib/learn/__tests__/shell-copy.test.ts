// The shell's own sentences (lib/learn/copy/shell.ts), held to the 'copy' tier of
// lib/learn/banned.ts. The dot sentences are pinned word for word: the browser QA reads them
// (qa-topics the News dot, qa-topics-refresh the Portfolio one).

import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {SHELL_COPY, dotLabel} from '@/lib/learn/copy/shell';

const clean = (text: string) => {
    expect(text, text).not.toMatch(/undefined|NaN|null|\[object|Infinity/);
    expect(findBanned(text, 'copy'), text).toEqual([]);
};

describe('SHELL_COPY', () => {
    it('never advises', () => {
        for (const value of Object.values(SHELL_COPY)) {
            if (typeof value === 'string') clean(value);
        }
        for (const text of [
            SHELL_COPY.sinceLastLook('3 hours ago'), SHELL_COPY.sinceLastLook('just now'),
            SHELL_COPY.newCount('3'), SHELL_COPY.newCount('99+'),
            SHELL_COPY.newsDot(1), SHELL_COPY.newsDot(2), SHELL_COPY.unpricedDot(1), SHELL_COPY.unpricedDot(2),
            dotLabel('newsNew', 3), dotLabel('unpriced', 1),
        ]) clean(text);
    });

    it('counts in words that agree', () => {
        expect(SHELL_COPY.newsDot(1)).toBe('new in 1 topic since you last looked');
        expect(SHELL_COPY.newsDot(3)).toBe('new in 3 topics since you last looked');
        expect(SHELL_COPY.unpricedDot(1)).toBe('1 holding valued at cost');
        expect(SHELL_COPY.unpricedDot(2)).toBe('2 holdings valued at cost');
        expect(SHELL_COPY.newCount('99+')).toBe('99+ new');
        expect(SHELL_COPY.sinceLastLook('3 hours ago')).toBe('Since you last looked · 3 hours ago');
    });

    it('labels only the dots the rail draws', () => {
        expect(dotLabel('newsNew', 2)).toBe(SHELL_COPY.newsDot(2));
        expect(dotLabel('unpriced', 1)).toBe(SHELL_COPY.unpricedDot(1));
        expect(dotLabel('watchlist', 3)).toBe('');
        expect(dotLabel('friendRequests', 1)).toBe('');
    });
});
