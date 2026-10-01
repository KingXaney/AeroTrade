import {describe, expect, it} from 'vitest';
import {formatChangePercent, getChangeColorClass} from '@/lib/format';

describe('formatChangePercent', () => {
    // A flat stock printed nothing at all (StockHeader's pill went blank), and a move inside
    // half a basis point printed "-0.00%" in red or "+0.00%" in green.
    it('prints a flat change as 0.00%, never blank and never a signed zero', () => {
        expect(formatChangePercent(0)).toBe('0.00%');
        expect(formatChangePercent(-0)).toBe('0.00%');
        expect(formatChangePercent(-0.003)).toBe('0.00%');
        expect(formatChangePercent(0.003)).toBe('0.00%');
    });

    it('rounds before it signs', () => {
        expect(formatChangePercent(0.005)).toBe('+0.01%');
        expect(formatChangePercent(-0.006)).toBe('-0.01%');
        expect(formatChangePercent(2.345)).toBe('+2.35%');
    });

    it('stays blank only when there is no figure', () => {
        expect(formatChangePercent(undefined)).toBe('');
        expect(formatChangePercent(null)).toBe('');
        expect(formatChangePercent(Number.NaN)).toBe('');
    });
});

describe('getChangeColorClass', () => {
    it('colours by the rounded value, so what prints 0.00% reads neutral', () => {
        expect(getChangeColorClass(-0.003)).toBe('text-fg-muted');
        expect(getChangeColorClass(0.004)).toBe('text-fg-muted');
        expect(getChangeColorClass(-0.006)).toBe('text-negative');
        expect(getChangeColorClass(0.005)).toBe('text-positive');
        expect(getChangeColorClass(null)).toBe('text-fg-muted');
        expect(getChangeColorClass(Number.NaN)).toBe('text-fg-muted');
    });
});
