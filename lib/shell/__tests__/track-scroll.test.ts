import {describe, expect, it} from 'vitest';
import {scrollToShow} from '@/lib/shell/track-scroll';

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
