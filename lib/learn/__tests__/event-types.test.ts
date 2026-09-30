// The evidence list's event badges: one per extractor label except 'other', each defined
// in the glossary, and nothing for a value the extractor never writes.

import {describe, expect, it} from 'vitest';
import {ExtractionBatchSchema} from '@/lib/brain/extraction';
import {findBanned} from '@/lib/learn/banned';
import {EVENT_BADGES, EVENT_TYPES, eventBadge, eventTermsShown} from '@/lib/learn/event-types';
import {GLOSSARY, isGlossaryKey} from '@/lib/learn/glossary';

const extractorLabels = (): readonly string[] =>
    ExtractionBatchSchema.shape.articles.element.shape.eventType.options;

describe('EVENT_TYPES', () => {
    it('is exactly the nine labels the extractor may write', () => {
        expect(EVENT_TYPES).toHaveLength(9);
        expect([...EVENT_TYPES]).toEqual([...extractorLabels()]);
    });

    it('gives every label but "other" a badge defined in the glossary', () => {
        for (const type of EVENT_TYPES) {
            const badge = eventBadge(type);
            if (type === 'other') {
                expect(badge).toBeNull();
                continue;
            }
            expect(badge, type).not.toBeNull();
            expect(isGlossaryKey(badge?.term ?? ''), type).toBe(true);
            expect(badge?.label.length ?? 0).toBeGreaterThan(0);
            expect(findBanned(badge?.label ?? '', 'copy')).toEqual([]);
        }
        expect(Object.keys(EVENT_BADGES)).toHaveLength(8);
    });

    it('names the filings an earnings article can come from', () => {
        const earnings = GLOSSARY[EVENT_BADGES.earnings.term];
        const text = `${earnings.short} ${earnings.long}`;
        for (const form of ['8-K', '10-Q', '10-K']) expect(text).toContain(form);
    });

    it('shows no badge for a value the extractor never writes', () => {
        for (const value of [undefined, null, '', 'EARNINGS', 'rumour', 42, {}, 'constructor', '__proto__', 'toString']) {
            expect(eventBadge(value), String(value)).toBeNull();
        }
    });
});

describe('eventTermsShown', () => {
    it('lists each shown label once, in the extractor\'s order, and leaves out "other"', () => {
        expect(eventTermsShown(['legal', 'earnings', 'other', 'earnings', undefined, 'bogus'])).toEqual(['event-earnings', 'event-legal']);
        expect(eventTermsShown([])).toEqual([]);
        expect(eventTermsShown(['other', 'other'])).toEqual([]);
    });
});
