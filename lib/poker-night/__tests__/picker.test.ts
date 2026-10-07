// A radio group's keys: the arrows step and wrap, Home and End jump, every other key is left to the
// page, and a group with nothing in it moves nowhere.

import {describe, expect, it} from 'vitest';
import {stepChoice} from '@/lib/poker-night/picker';

describe('stepChoice', () => {
    it('steps forward and back, wrapping at both ends', () => {
        expect(stepChoice(0, 'ArrowRight', 4)).toBe(1);
        expect(stepChoice(3, 'ArrowRight', 4)).toBe(0);
        expect(stepChoice(3, 'ArrowDown', 4)).toBe(0);
        expect(stepChoice(0, 'ArrowLeft', 4)).toBe(3);
        expect(stepChoice(2, 'ArrowUp', 4)).toBe(1);
    });

    it('jumps to the first and the last', () => {
        expect(stepChoice(2, 'Home', 40)).toBe(0);
        expect(stepChoice(2, 'End', 40)).toBe(39);
    });

    it('leaves every other key alone, and moves nowhere in an empty group', () => {
        for (const key of ['Enter', ' ', 'Tab', 'a', 'PageDown']) expect(stepChoice(1, key, 4)).toBeNull();
        expect(stepChoice(0, 'ArrowRight', 0)).toBeNull();
        expect(stepChoice(0, 'ArrowRight', Number.NaN)).toBeNull();
    });

    it('starts from a valid place whatever the index it is handed', () => {
        expect(stepChoice(-1, 'ArrowRight', 4)).toBe(1);
        expect(stepChoice(99, 'ArrowLeft', 4)).toBe(2);
        expect(stepChoice(Number.NaN, 'ArrowRight', 4)).toBe(1);
        expect(stepChoice(0, 'ArrowRight', 1)).toBe(0);
    });
});
