import {afterEach, describe, expect, it, vi} from 'vitest';
import {cn, formatChangePercent, formatMarketCapValue, formatPrice, formatTimeAgo, getChangeColorClass} from '@/lib/utils';

describe('formatTimeAgo', () => {
    afterEach(() => vi.useRealTimers());

    it('reports minutes, hours and days relative to now (unix seconds in)', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-05T12:00:00Z'));
        const now = Math.floor(Date.now() / 1000);
        expect(formatTimeAgo(now - 5 * 60)).toBe('5 minutes ago');
        expect(formatTimeAgo(now - 60)).toBe('1 minute ago');
        expect(formatTimeAgo(now - 3 * 3600)).toBe('3 hours ago');
        expect(formatTimeAgo(now - 3600)).toBe('1 hour ago');
        expect(formatTimeAgo(now - 3 * 86400)).toBe('3 days ago');
        expect(formatTimeAgo(now - 25 * 3600)).toBe('1 day ago');
    });

    it('treats exactly 24 hours as hours, not days', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-05T12:00:00Z'));
        expect(formatTimeAgo(Math.floor(Date.now() / 1000) - 24 * 3600)).toBe('24 hours ago');
    });
});

describe('formatMarketCapValue', () => {
    it('scales to T/B/M with two decimals', () => {
        expect(formatMarketCapValue(3.1e12)).toBe('$3.10T');
        expect(formatMarketCapValue(9e11)).toBe('$900.00B');
        expect(formatMarketCapValue(2.5e7)).toBe('$25.00M');
        expect(formatMarketCapValue(999_999.99)).toBe('$999999.99');
    });

    it('returns N/A for missing or non-positive values', () => {
        expect(formatMarketCapValue(0)).toBe('N/A');
        expect(formatMarketCapValue(-5)).toBe('N/A');
        expect(formatMarketCapValue(Number.NaN)).toBe('N/A');
        expect(formatMarketCapValue(Number.POSITIVE_INFINITY)).toBe('N/A');
    });
});

describe('formatChangePercent + getChangeColorClass', () => {
    it('signs gains, leaves losses signed by the number, hides zero', () => {
        expect(formatChangePercent(2.345)).toBe('+2.35%');
        expect(formatChangePercent(-0.5)).toBe('-0.50%');
        expect(formatChangePercent(0)).toBe('');
        expect(formatChangePercent(undefined)).toBe('');
    });

    it('maps sign to the semantic colour tokens', () => {
        expect(getChangeColorClass(1)).toBe('text-positive');
        expect(getChangeColorClass(-1)).toBe('text-negative');
        expect(getChangeColorClass(0)).toBe('text-fg-muted');
        expect(getChangeColorClass(undefined)).toBe('text-fg-muted');
    });
});

describe('formatPrice', () => {
    it('formats as US dollars with cents', () => {
        expect(formatPrice(1234.5)).toBe('$1,234.50');
        expect(formatPrice(0)).toBe('$0.00');
        expect(formatPrice(319.974)).toBe('$319.97');
    });
});

describe('cn', () => {
    it('merges conditional classes and resolves Tailwind conflicts', () => {
        expect(cn('p-2', {hidden: false, block: true}, 'p-4')).toBe('block p-4');
    });
});
