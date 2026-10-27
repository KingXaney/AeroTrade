// The office's legend: every figure from the constants, every line clean at the copy tier and
// mechanism only — nothing says a seat works, fails, wins or beats anything.

import {describe, expect, it} from 'vitest';
import {officeLegend} from '@/lib/agent-world/office-legend';
import {findBanned} from '@/lib/learn/banned';

const MECHANISM_ONLY = /\b(works?|worked|working|fails?|failed|beat(s|en|ing)?|outperform\w*|underperform\w*|lags?|lagged|wins?|loses)\b/i;

describe('officeLegend', () => {
    const legend = officeLegend();
    const lines = legend.sections.flatMap((section) => section.lines);

    it('states the figures from config', () => {
        const text = lines.join('\n');
        expect(text).toContain('every 3 seconds while a session is in progress and every 30 seconds otherwise');
        expect(text).toContain('over 60 seconds');
        expect(text).toContain('about 6 seconds after its event');
    });

    it('holds every line to the copy tier and to mechanism only, each a sentence', () => {
        expect(legend.sections).toHaveLength(4);
        for (const text of [legend.summary, ...legend.sections.map((s) => s.heading), ...lines]) {
            expect(text, text).not.toMatch(/undefined|NaN|null|\[object|Infinity/);
            expect(findBanned(text, 'copy'), text).toEqual([]);
            expect(text, text).not.toMatch(MECHANISM_ONLY);
        }
        for (const line of lines) expect(line.endsWith('.'), line).toBe(true);
    });
});
