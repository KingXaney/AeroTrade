// The signal check's shared words, held to the copy tier and the mechanism-only rule: a table of
// coefficients says how closely two orders agreed, never that a signal works or a picker wins.

import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {RESEARCH_COPY} from '@/lib/learn/copy/research';

const MECHANISM_ONLY = /\b(works?|worked|working|fails?|failed|beat(s|en|ing)?|outperform\w*|underperform\w*|lags?|lagged|wins?)\b/i;

describe('RESEARCH_COPY', () => {
    it('describes without advice', () => {
        const lines = [
            RESEARCH_COPY.signalHeader, RESEARCH_COPY.horizonCaption, RESEARCH_COPY.horizon(1), RESEARCH_COPY.horizon(13),
            RESEARCH_COPY.tLine(2.43), RESEARCH_COPY.tLine(-0.04), RESEARCH_COPY.tLine(null),
            RESEARCH_COPY.weeksNote(259), RESEARCH_COPY.weeksNote(1), RESEARCH_COPY.hurdle(70), RESEARCH_COPY.hurdle(1),
        ];
        for (const line of lines) {
            expect(line).not.toMatch(/undefined|NaN|null|Infinity/);
            expect(findBanned(line, 'copy'), line).toEqual([]);
            expect(line).not.toMatch(MECHANISM_ONLY);
        }
    });

    it('signs a t-statistic and names a horizon in words', () => {
        expect(RESEARCH_COPY.tLine(-0.04)).toBe('t −0.0');
        expect(RESEARCH_COPY.tLine(2.43)).toBe('t +2.4');
        expect(RESEARCH_COPY.tLine(null)).toBe('t —');
        expect(RESEARCH_COPY.horizon(1)).toBe('1 week');
        expect(RESEARCH_COPY.horizon(4)).toBe('4 weeks');
        expect(RESEARCH_COPY.hurdle(1)).toMatch(/^1 figure is read/);
    });
});
