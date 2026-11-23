import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {EDGE_FADE_REM, edgeFade, scrollToShow} from '@/lib/shell/track-scroll';

// A tab track 343px wide (a 375px phone less its 16px sides), its current tab 80px wide, 16px of
// the row kept in sight beside it.
const span = (start: number, scrollLeft = 0, {width = 343, size = 80, inset = 16} = {}) =>
    scrollToShow({start, end: start + size, scrollLeft, width, inset});

describe('scrollToShow', () => {
    it('leaves a tab already in sight, with room beside it, where it is', () => {
        expect(span(20)).toBeNull();
        expect(span(120, 60)).toBeNull();
    });

    it('brings a tab past the right edge in, with room after it', () => {
        expect(span(300)).toBe(300 + 80 + 16 - 343);
        // …and then leaves it there.
        expect(span(300, 53)).toBeNull();
    });

    it('brings a tab before the left edge, or cut by it, back in, with room before it', () => {
        expect(span(150, 200)).toBe(134);
        expect(span(190, 200)).toBe(174);
    });

    it('never asks for a scroll before the row starts, and none that changes nothing', () => {
        expect(span(10, 100)).toBe(0);
        // The first tab, at the row's own start with the track unscrolled: nothing to do.
        expect(span(3)).toBeNull();
    });

    it('centres a tab that fits but leaves less than the room on both sides', () => {
        // 280px of tab in 300px: 10px each side.
        expect(scrollToShow({start: 100, end: 380, scrollLeft: 0, width: 300, inset: 16})).toBe(90);
    });

    it('lines a tab wider than the track up at its start', () => {
        expect(scrollToShow({start: 50, end: 450, scrollLeft: 0, width: 300, inset: 16})).toBe(50);
        expect(scrollToShow({start: 50, end: 450, scrollLeft: 50, width: 300, inset: 16})).toBeNull();
    });

    it('takes no room when none is asked for', () => {
        expect(scrollToShow({start: 300, end: 380, scrollLeft: 0, width: 343})).toBe(37);
    });
});

// The Learn section's five tabs on a 320px phone: a row 413px long in a track 288px wide.
const row = (scrollLeft: number, {width = 288, scrollWidth = 413, overflowX = 'auto'} = {}) => edgeFade({scrollLeft, width, scrollWidth, overflowX});

describe('edgeFade', () => {
    it('fades the end while the row is at its start, and the start once it is at its end', () => {
        expect(row(0)).toBe('end');
        expect(row(125)).toBe('start');
        expect(row(0, {overflowX: 'scroll'})).toBe('end');
    });

    it('fades both ends in between', () => {
        expect(row(63)).toBe('both');
    });

    it('fades nowhere when the row fits, nor for a pixel of rounding', () => {
        expect(row(0, {width: 343, scrollWidth: 343})).toBeNull();
        expect(row(0.5, {width: 358, scrollWidth: 359})).toBeNull();
        expect(row(124.5)).toBe('start');
    });

    // The topics' rail from lg is a column that does not scroll sideways (overflow visible), and its
    // topics' box reaches 4px past each of its sides, room for a row's focus ring: 161px wide with
    // 165 of content at 1440. A fade there cut that room off, with the pills' right ends and the
    // current row's tint, on a rail with nothing more to scroll to.
    it('fades nowhere on a box that does not scroll sideways, however far its content reaches', () => {
        expect(row(0, {width: 161, scrollWidth: 165, overflowX: 'visible'})).toBeNull();
        expect(row(0, {width: 200, scrollWidth: 204, overflowX: 'visible'})).toBeNull();
        expect(row(0, {overflowX: 'hidden'})).toBeNull();
        expect(row(0, {overflowX: 'clip'})).toBeNull();
        // The same reach on a row that scrolls is more to scroll to.
        expect(row(0, {width: 161, scrollWidth: 165})).toBe('end');
    });
});

// The fade's width is said twice, in rem: by the stylesheet that draws it (data-edge-fade) and by
// the hook that keeps that much of the row beside the current tab, so the current one is never
// under it. In rem on both sides, so a reader's own browser size moves both alike.
describe('the fade the stylesheet draws', () => {
    const css = readFileSync(fileURLToPath(new URL('../../../app/globals.css', import.meta.url)), 'utf8');
    const rules = css.match(/\[data-edge-fade="(?:start|end|both)"\]\s*\{[^}]*\}/g) ?? [];

    it('is EDGE_FADE_REM wide at each end it fades, the room the hook keeps', () => {
        expect(rules.length).toBe(3);
        for (const rule of rules) {
            const lengths = [...rule.matchAll(/(\d*\.?\d+)rem\b/g)].map(([, n]) => Number(n));
            expect(lengths.length, rule).toBeGreaterThan(0);
            expect(lengths.every((n) => n === EDGE_FADE_REM), rule).toBe(true);
            expect(rule, rule).not.toMatch(/\d(px|em)\b/);
        }
    });

    it('is the hook\'s room, read from the root size at the time', () => {
        const hook = readFileSync(fileURLToPath(new URL('../../../hooks/useCurrentInTrack.ts', import.meta.url)), 'utf8');
        expect(hook).toMatch(/EDGE_FADE_REM \* parseFloat\(getComputedStyle\(document\.documentElement\)\.fontSize\)/);
        expect(hook).not.toMatch(/\bINSET\s*=\s*\d/);
        expect(hook).toMatch(/overflowX: getComputedStyle\(track\)\.overflowX/);
    });
});
