// The evidence list's event badges: one per extractor label except 'other', each defined
// in the glossary, and nothing for a value the extractor never writes.

import {describe, expect, it} from 'vitest';
import {ExtractionBatchSchema} from '@/lib/brain/extraction';
import {findBanned} from '@/lib/learn/banned';
import {EVENT_BADGES, EVENT_TYPES, eventBadge, eventTermsShown, NATURE_BADGES, natureBadge, natureTermsShown} from '@/lib/brain/event-types';
import {NATURES} from '@/lib/brain/config';
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
            // Its own label's entry, not merely some entry: "Guidance" is defined by event-guidance.
            expect(badge?.term, type).toBe(`event-${type}`);
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

describe('NATURES', () => {
    it('is exactly the four natures the extractor may write, reported first', () => {
        expect([...NATURES]).toEqual([...ExtractionBatchSchema.shape.articles.element.shape.nature.removeDefault().options]);
        expect(NATURES[0]).toBe('reported');
    });

    it('gives every nature but "reported" a badge defined in the glossary', () => {
        for (const nature of NATURES) {
            const badge = natureBadge(nature);
            if (nature === 'reported') {
                expect(badge).toBeNull();
                continue;
            }
            expect(badge, nature).not.toBeNull();
            expect(badge?.term, nature).toBe(`nature-${nature}`);
            expect(isGlossaryKey(badge?.term ?? ''), nature).toBe(true);
            expect(findBanned(badge?.label ?? '', 'copy')).toEqual([]);
        }
        expect(Object.keys(NATURE_BADGES)).toHaveLength(3);
    });

    it('shows no badge for a value the extractor never writes', () => {
        for (const value of [undefined, null, '', 'OPINION', 'editorial', 'earnings', 42, {}, 'constructor', '__proto__']) {
            expect(natureBadge(value), String(value)).toBeNull();
        }
    });

    it('lists each shown nature once, in order, leaving out "reported" and rows without one', () => {
        expect(natureTermsShown(['rumour', 'opinion', null, 'reported', 'opinion', undefined, 'bogus'])).toEqual(['nature-opinion', 'nature-rumour']);
        expect(natureTermsShown([null, null])).toEqual([]);
    });
});

describe('eventTermsShown', () => {
    it('lists each shown label once, in the extractor\'s order, and leaves out "other"', () => {
        expect(eventTermsShown(['legal', 'earnings', 'other', 'earnings', undefined, 'bogus'])).toEqual(['event-earnings', 'event-legal']);
        expect(eventTermsShown([])).toEqual([]);
        expect(eventTermsShown(['other', 'other'])).toEqual([]);
    });
});
