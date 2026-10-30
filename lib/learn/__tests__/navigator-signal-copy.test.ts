// The Navigator signal check's words: the copy tier, the mechanism-only rule (a coefficient says
// how closely two orders agreed, never that the Navigator works), and only glossary terms listed.

import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {GLOSSARY} from '@/lib/learn/glossary';
import {NAVIGATOR_SIGNAL_COPY, NAVIGATOR_SIGNAL_TERMS} from '@/lib/learn/copy/navigator';
import {NAVIGATOR_SIGNALS} from '@/lib/navigator/signal-check';

const MECHANISM_ONLY = /\b(works?|worked|working|fails?|failed|beat(s|en|ing)?|outperform\w*|underperform\w*|lags?|lagged)\b/i;

describe('NAVIGATOR_SIGNAL_COPY', () => {
    it('describes without advice, and claims nothing for the Navigator', () => {
        const lines = [
            NAVIGATOR_SIGNAL_COPY.heading, NAVIGATOR_SIGNAL_COPY.lead, NAVIGATOR_SIGNAL_COPY.notStarted,
            NAVIGATOR_SIGNAL_COPY.recording('2026-11-02', 1), NAVIGATOR_SIGNAL_COPY.recording('2026-11-02', 7),
            ...Object.values(NAVIGATOR_SIGNAL_COPY.rows),
        ];
        for (const line of lines) {
            expect(line).not.toMatch(/undefined|NaN|null|Infinity/);
            expect(findBanned(line, 'copy'), line).toEqual([]);
            expect(line).not.toMatch(MECHANISM_ONLY);
        }
        expect(NAVIGATOR_SIGNAL_COPY.recording('2026-11-02', 1)).toMatch(/: 1 week so far/);
    });

    it('names every signal the check measures, and lists only glossary entries', () => {
        expect(Object.keys(NAVIGATOR_SIGNAL_COPY.rows).sort()).toEqual([...NAVIGATOR_SIGNALS].sort());
        for (const key of NAVIGATOR_SIGNAL_TERMS) expect(GLOSSARY[key], key).toBeDefined();
    });
});
