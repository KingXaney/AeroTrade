import {readdirSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {
    formatCapped, formatChangePercent, formatDrawdown, formatEasternTimestamp, formatMarketCapValue, formatPct, formatPrice, formatTimeAgoCompactSeconds,
    formatSigned, formatSignedPrice, formatTimeAgoMs, formatTimeAgoSeconds, formatTimeUntilMs, getChangeColorClass, roundPct, signedForColor,
} from '@/lib/format';

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

describe("rounded percent formatting", () => {
    it("never shows a signed zero and colours by the rounded value", () => {
        expect(formatPct(-0.003)).toBe('0.00%');
        expect(formatPct(0.004)).toBe('0.00%');
        expect(formatPct(0.005)).toBe('+0.01%');
        expect(formatPct(-12.346)).toBe('-12.35%');
        expect(formatPct(null)).toBe('—');
        expect(formatDrawdown(0.003)).toBe('0.00%');
        expect(formatDrawdown(2.5)).toBe('−2.50%');
        expect(formatDrawdown(null)).toBe('—');
        expect(roundPct(1.23456, 1)).toBe(1.2);
        expect(signedForColor(-0.003)).toBeUndefined();
        expect(signedForColor(0.5)).toBe(0.5);
        expect(signedForColor(null)).toBeUndefined();
    });
});

describe('formatTimeAgoSeconds', () => {
    afterEach(() => vi.useRealTimers());

    it('reports minutes, hours and days relative to now (unix seconds in)', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-05T12:00:00Z'));
        const now = Math.floor(Date.now() / 1000);
        expect(formatTimeAgoSeconds(now - 5 * 60)).toBe('5 minutes ago');
        expect(formatTimeAgoSeconds(now - 60)).toBe('1 minute ago');
        expect(formatTimeAgoSeconds(now - 3 * 3600)).toBe('3 hours ago');
        expect(formatTimeAgoSeconds(now - 3600)).toBe('1 hour ago');
        expect(formatTimeAgoSeconds(now - 3 * 86400)).toBe('3 days ago');
        expect(formatTimeAgoSeconds(now - 25 * 3600)).toBe('1 day ago');
    });

    it('says "just now" under a minute, including timestamps ahead of the clock', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-05T12:00:00Z'));
        const now = Math.floor(Date.now() / 1000);
        expect(formatTimeAgoSeconds(now)).toBe('just now');
        expect(formatTimeAgoSeconds(now - 30)).toBe('just now');
        expect(formatTimeAgoSeconds(now + 90)).toBe('just now');
    });

    it('treats exactly 24 hours as hours, not days', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-05T12:00:00Z'));
        expect(formatTimeAgoSeconds(Math.floor(Date.now() / 1000) - 24 * 3600)).toBe('24 hours ago');
    });
});

describe('formatTimeAgoMs', () => {
    afterEach(() => vi.useRealTimers());

    // Friend requests carry epoch milliseconds; read as seconds they landed a thousand times
    // in the future, and every pending request said "sent just now" however old it was.
    it('reads epoch milliseconds, so a three-day-old request says so', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-05T12:00:00Z'));
        const now = Date.now();
        expect(formatTimeAgoMs(now - 3 * 86_400_000)).toBe('3 days ago');
        expect(formatTimeAgoMs(now - 3 * 3_600_000)).toBe('3 hours ago');
        expect(formatTimeAgoMs(now - 5 * 60_000)).toBe('5 minutes ago');
        expect(formatTimeAgoMs(now + 90_000)).toBe('just now');
    });

    it('agrees with the seconds reader on the same instant', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-05T12:00:00Z'));
        const then = Date.now() - 26 * 3_600_000;
        expect(formatTimeAgoMs(then)).toBe(formatTimeAgoSeconds(then / 1000));
    });
});

describe('formatTimeAgoCompactSeconds', () => {
    // The rail's News card prints the age beside a truncating headline, so the words become
    // 'now' / '59m' / '3h' / '2d' at the same thresholds as formatTimeAgoMs.
    const now = Date.UTC(2026, 8, 5, 12, 0, 0);
    const at = (msAgo: number) => (now - msAgo) / 1000;

    it('shortens the age at the same thresholds as the long form', () => {
        expect(formatTimeAgoCompactSeconds(at(30_000), now)).toBe('now');
        expect(formatTimeAgoCompactSeconds(at(-90_000), now)).toBe('now');
        expect(formatTimeAgoCompactSeconds(at(59 * 60_000), now)).toBe('59m');
        expect(formatTimeAgoCompactSeconds(at(3 * 3_600_000), now)).toBe('3h');
        expect(formatTimeAgoCompactSeconds(at(24 * 3_600_000), now)).toBe('24h');
        expect(formatTimeAgoCompactSeconds(at(26 * 3_600_000), now)).toBe('1d');
        expect(formatTimeAgoCompactSeconds(at(3 * 86_400_000), now)).toBe('3d');
    });
});

describe('formatCapped', () => {
    // The topics store counts unseen articles to the cap plus one at most, so a count past the cap
    // is only "at least this many" and prints as such.
    it('prints a count up to the cap and "99+" past it', () => {
        expect(formatCapped(0, 99)).toBe('0');
        expect(formatCapped(3, 99)).toBe('3');
        expect(formatCapped(99, 99)).toBe('99');
        expect(formatCapped(100, 99)).toBe('99+');
        expect(formatCapped(1600, 99)).toBe('99+');
    });
});

describe('formatTimeUntilMs', () => {
    // The chat's rate-limit windows roll from their first hit, so "resets in 2h 10m" is exact in
    // every zone where an ET clock time would not be. `now` is passed in: nothing reads the clock.
    const now = Date.UTC(2026, 9, 2, 14, 0, 0);

    it('counts whole minutes, then hours and minutes, dropping a zero remainder', () => {
        expect(formatTimeUntilMs(now + 12 * 60_000 + 30_000, now)).toBe('12m');
        expect(formatTimeUntilMs(now + 59 * 60_000 + 59_000, now)).toBe('59m');
        expect(formatTimeUntilMs(now + 2 * 3_600_000 + 10 * 60_000, now)).toBe('2h 10m');
        expect(formatTimeUntilMs(now + 9 * 3_600_000 + 30_000, now)).toBe('9h');
    });

    it('says "under a minute" for anything closer, including a stamp already passed', () => {
        expect(formatTimeUntilMs(now + 30_000, now)).toBe('under a minute');
        expect(formatTimeUntilMs(now - 5_000, now)).toBe('under a minute');
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
    it('signs gains, leaves losses signed by the number, prints a flat 0.00%', () => {
        expect(formatChangePercent(2.345)).toBe('+2.35%');
        expect(formatChangePercent(-0.5)).toBe('-0.50%');
        expect(formatChangePercent(0)).toBe('0.00%');
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
