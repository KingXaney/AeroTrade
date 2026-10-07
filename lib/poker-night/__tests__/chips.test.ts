// Chips as the table draws them: an amount in the fewest chips, at most three columns of at most
// eight, the largest denominations first and never more than the amount; and the short form a
// phone's seat plate prints from 100,000 on.

import {describe, expect, it} from 'vitest';
import {CHIP_COLUMNS, CHIPS_PER_COLUMN, chipBreakdown, compactChips, countUpValue, cssTimeMs, DENOMINATIONS, drawnValue} from '@/lib/poker-night/chips';
import {mulberry32} from '@/lib/random';

describe('chip stacks', () => {
    it('breaks an amount into the fewest chips, largest first', () => {
        expect(chipBreakdown(1630)).toEqual([{denom: 1000, count: 1}, {denom: 500, count: 1}, {denom: 100, count: 1}]);
        expect(chipBreakdown(60)).toEqual([{denom: 25, count: 2}, {denom: 5, count: 2}]);
        expect(chipBreakdown(20)).toEqual([{denom: 5, count: 4}]);
        expect(drawnValue(chipBreakdown(60))).toBe(60);
    });

    it('draws at most three columns of at most eight chips, never more than the amount', () => {
        const random = mulberry32(7);
        for (let i = 0; i < 2000; i++) {
            const amount = Math.floor(random() * 2_000_000);
            const columns = chipBreakdown(amount);
            expect(columns.length).toBeLessThanOrEqual(CHIP_COLUMNS);
            for (const c of columns) {
                expect(c.count).toBeGreaterThan(0);
                expect(c.count).toBeLessThanOrEqual(CHIPS_PER_COLUMN);
                expect(DENOMINATIONS).toContain(c.denom);
            }
            expect(drawnValue(columns)).toBeLessThanOrEqual(amount);
            expect(columns.map((c) => c.denom)).toEqual([...columns.map((c) => c.denom)].sort((a, b) => b - a));
        }
        expect(chipBreakdown(1_000_000)).toEqual([{denom: 25000, count: 8}]);
    });

    it('draws nothing for nothing', () => {
        expect(chipBreakdown(0)).toEqual([]);
        expect(chipBreakdown(-5)).toEqual([]);
        expect(chipBreakdown(Number.NaN)).toEqual([]);
    });
});

describe('the short form', () => {
    it('prints in full below 100,000, then thousands and millions', () => {
        expect(compactChips(0)).toBe('0');
        expect(compactChips(12_500)).toBe('12,500');
        expect(compactChips(99_999)).toBe('99,999');
        expect(compactChips(100_000)).toBe('100k');
        expect(compactChips(125_500)).toBe('125.5k');
        expect(compactChips(999_999)).toBe('999.9k');
        expect(compactChips(1_250_000)).toBe('1.25M');
        expect(compactChips(10_000_000)).toBe('10M');
    });
});

describe('a stack counting up', () => {
    it('runs from the old count to the new, whole chips, easing out, never past either end', () => {
        expect(countUpValue(1980, 2050, -10, 500)).toBe(1980);
        expect(countUpValue(1980, 2050, 0, 500)).toBe(1980);
        expect(countUpValue(1980, 2050, 500, 500)).toBe(2050);
        expect(countUpValue(1980, 2050, 9000, 500)).toBe(2050);
        const steps = Array.from({length: 51}, (_, i) => countUpValue(1980, 2050, i * 10, 500));
        expect(steps.every((n) => Number.isInteger(n) && n >= 1980 && n <= 2050)).toBe(true);
        for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThanOrEqual(steps[i - 1]);
        // Easing out: more than half the way there at half the time.
        expect(countUpValue(0, 1000, 250, 500)).toBeGreaterThan(500);
    });

    it('shows the new count at once when there is no time (the motion token zeroed)', () => {
        expect(countUpValue(100, 2400, 0, 0)).toBe(2400);
        expect(countUpValue(100, 2400, 0, Number.NaN)).toBe(2400);
    });

    it('prints every step the way a plate prints a stack, separators and all', () => {
        for (let t = 0; t <= 500; t += 50) expect(compactChips(countUpValue(9800, 12_400, t, 500))).toMatch(/^\d{1,2},\d{3}$/);
    });

    it('reads the motion token', () => {
        expect(cssTimeMs('200ms')).toBe(200);
        expect(cssTimeMs(' 0.2s')).toBe(200);
        expect(cssTimeMs('0ms')).toBe(0);
        expect(cssTimeMs('')).toBe(0);
        expect(cssTimeMs('fast')).toBe(0);
    });
});
