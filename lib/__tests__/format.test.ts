import {readdirSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {formatChangePercent, formatDrawdown, formatEasternTimestamp, formatSigned, formatSignedPrice, getChangeColorClass} from '@/lib/format';

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

describe('formatSignedPrice', () => {
    it('rounds to the cent before it signs, so a flat P&L is never "-$0.00"', () => {
        expect(formatSignedPrice(-0.004)).toBe('$0.00');
        expect(formatSignedPrice(-0)).toBe('$0.00');
        expect(formatSignedPrice(0.004)).toBe('$0.00');
        expect(formatSignedPrice(1234.5)).toBe('+$1,234.50');
        expect(formatSignedPrice(-3.2)).toBe('-$3.20');
    });
});

describe('formatSigned', () => {
    it('signs a plain figure (a sentiment score) by its rounded value', () => {
        expect(formatSigned(-0.003)).toBe('0.00');
        expect(formatSigned(0)).toBe('0.00');
        expect(formatSigned(0.25)).toBe('+0.25');
        expect(formatSigned(-0.25)).toBe('-0.25');
        expect(formatSigned(0.125, 1)).toBe('+0.1');
    });
});

describe('formatDrawdown', () => {
    it('reads an account that never fell as 0.00%, not "−0.00%"', () => {
        expect(formatDrawdown(0)).toBe('0.00%');
        expect(formatDrawdown(0.001)).toBe('0.00%');
        expect(formatDrawdown(4.2)).toBe('−4.20%');
    });
});

// The screens hand-wrote `x >= 0 ? '+' : ''` and `−${dd.toFixed(2)}%`, so a tiny loss read as a
// red "-0.00%" and a flat drawdown as "−0.00%". Every sign now comes from this module.
describe('no hand-rolled signs in the UI', () => {
    const root = fileURLToPath(new URL('../..', import.meta.url));
    const sources = ['components', 'app'].flatMap((dir) =>
        readdirSync(`${root}${dir}`, {recursive: true, encoding: 'utf8'})
            .filter((f) => /\.tsx?$/.test(f))
            .map((f) => `${dir}/${f}`));

    it('routes every signed number through lib/format', () => {
        const handRolled = sources.filter((file) => {
            const text = readFileSync(`${root}${file}`, 'utf8');
            return /\?\s*['"]\+['"]\s*:\s*['"]['"]/.test(text) || /−\$?\{[^}]*toFixed\(/.test(text);
        });
        expect(sources.length).toBeGreaterThan(50);
        expect(handRolled).toEqual([]);
    });
});

describe('formatEasternTimestamp', () => {
    // Vercel renders in UTC: an add made at 8:30 PM ET read as the next day at 1:30 AM with no
    // zone, beside trade times labelled ET. Both now pin the zone and name it.
    const plain = (text: string) => text.replace(/\u202f/g, ' ');

    it('prints Eastern time with an ET label, whatever zone the server runs in', () => {
        const instant = new Date('2026-03-02T01:30:00Z');
        expect(plain(formatEasternTimestamp(instant))).toBe('Mar 1, 8:30 PM ET');
        expect(plain(formatEasternTimestamp(instant.getTime()))).toBe('Mar 1, 8:30 PM ET');
        expect(plain(formatEasternTimestamp(instant, {year: true}))).toBe('Mar 1, 2026, 8:30 PM ET');
    });

    it('follows daylight saving time', () => {
        expect(plain(formatEasternTimestamp(new Date('2026-07-01T00:30:00Z')))).toBe('Jun 30, 8:30 PM ET');
    });
});
