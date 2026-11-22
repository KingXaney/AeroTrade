// Settings › Appearance's sentences (lib/learn/copy/settings.ts), held to the 'copy' tier of
// lib/learn/banned.ts. The app has one look: a reader chooses a palette and whether motion is
// reduced, so no line here may offer a style, a preset or a layout.

import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {APPEARANCE_COPY} from '@/lib/learn/copy/settings';

const strings = (value: unknown): string[] => {
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.flatMap(strings);
    if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
    return [];
};

describe('APPEARANCE_COPY', () => {
    const all = strings(APPEARANCE_COPY);

    it('never advises, in any line', () => {
        expect(all.length).toBeGreaterThanOrEqual(5);
        for (const text of all) {
            expect(text, text).not.toMatch(/undefined|NaN|null|\[object|Infinity/);
            expect(text.trim(), text).toBe(text);
            expect(findBanned(text, 'copy'), text).toEqual([]);
        }
    });

    it('offers a palette and the motion switch, and nothing the one look took away', () => {
        for (const text of all) {
            expect(text, text).not.toMatch(/\bstyles?\b|\bpresets?\b|\blayouts?\b|\bparticles?\b|\bbackdrops?\b|\bshimmer\b/i);
        }
        expect(APPEARANCE_COPY.intro).toMatch(/palette/);
        // A saved theme follows the account (lib/actions/appearance.actions.ts), and the page says so.
        expect(APPEARANCE_COPY.intro).toMatch(/every device/);
        expect(APPEARANCE_COPY.motion.title).toBe('Reduce motion');
        // The OS setting stops motion whatever the switch says (app/globals.css, the motion guards).
        expect(APPEARANCE_COPY.motion.hint).toMatch(/OS setting/);
    });
});
