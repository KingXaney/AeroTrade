// The momentum terrain's sentences (lib/learn/copy/terrain.ts), held to the 'copy' tier of
// lib/learn/banned.ts: a surface of SPY momentum on the front door describes a shape, never a
// direction to take.

import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {TERRAIN_COPY, TERRAIN_TERMS} from '@/lib/learn/copy/terrain';
import {CAMERA_PRESET_IDS} from '@/lib/landing/terrain-view';
import {isGlossaryKey} from '@/lib/learn/glossary';

const strings = (value: unknown): string[] => {
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.flatMap(strings);
    if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
    return [];
};
describe('TERRAIN_COPY', () => {
    // Every fixed line, and every function called with the kind of value the page hands it.
    const rendered = [
        ...strings(TERRAIN_COPY),
        TERRAIN_COPY.caption(250),
        TERRAIN_COPY.caption(149),
        TERRAIN_COPY.updated('2026-10-06'),
        TERRAIN_COPY.ariaLabel({updated: '2026-10-06', days: 250, z20: 1.4}),
        TERRAIN_COPY.ariaLabel({updated: '2026-01-02', days: 60, z20: -0.25}),
        TERRAIN_COPY.tooltip.date('2026-04-04'),
        TERRAIN_COPY.tooltip.lookback(20),
        TERRAIN_COPY.tooltip.close(671.2),
        TERRAIN_COPY.notable({date: '2026-04-04', lookback: 5, z: -3.214}),
        TERRAIN_COPY.sliceHeading(20),
    ];

    it('never advises, and prints no placeholder', () => {
        expect(rendered.length).toBeGreaterThan(20);
        for (const text of rendered) {
            expect(text, text).not.toMatch(/undefined|NaN|null|\[object|Infinity/);
            expect(text, text).not.toMatch(/\d\s?%/);
            expect(findBanned(text, 'copy'), text).toEqual([]);
        }
    });

    it('prints the surface\'s own numbers the way the page shows them', () => {
        expect(TERRAIN_COPY.updated('2026-10-06')).toBe('Updated Oct 6, 2026');
        expect(TERRAIN_COPY.ariaLabel({updated: '2026-10-06', days: 250, z20: 1.4}))
            .toBe('SPY momentum surface over the last 250 sessions, updated Oct 6, 2026: 20-day momentum +1.40σ.');
        expect(TERRAIN_COPY.tooltip.close(671.2)).toBe('SPY close $671.20');
        expect(TERRAIN_COPY.tooltip.lookback(20)).toBe('20-day lookback');
        expect(TERRAIN_COPY.notable({date: '2026-04-04', lookback: 5, z: -3.214})).toBe('Apr 4: -3.21σ over 5 days');
        expect(TERRAIN_COPY.caption(250)).toContain('the last 250 sessions');
    });

    it('names a camera preset for each the view defines, and lists only glossary terms', () => {
        expect(Object.keys(TERRAIN_COPY.presets)).toEqual([...CAMERA_PRESET_IDS]);
        for (const key of TERRAIN_TERMS) expect(isGlossaryKey(key), key).toBe(true);
        expect(TERRAIN_TERMS).toContain('normalized-momentum');
        expect(TERRAIN_TERMS).toContain('lookback');
    });
});
