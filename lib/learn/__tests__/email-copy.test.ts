// The emails' fixed sentences (lib/learn/copy/email.ts), held to the 'copy' tier of
// lib/learn/banned.ts like every other learner-facing line, with their figures from the app's
// own constants.

import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {DIGEST_COPY, EMAIL_FOOTER_COPY, oneLine, RESET_EMAIL_COPY, SUBJECT_MAX, WELCOME_EMAIL_COPY} from '@/lib/learn/copy/email';
import type {SuggestionAction} from '@/lib/navigator/types';

const strings = (value: unknown): string[] => {
    if (typeof value === 'string') return [value];
    if (typeof value === 'function') return [];
    if (Array.isArray(value)) return value.flatMap(strings);
    if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
    return [];
};

const ACTIONS: SuggestionAction[] = ['buy', 'sell', 'hold'];

const rendered = (): string[] => [
    ...strings(EMAIL_FOOTER_COPY),
    ...strings(DIGEST_COPY),
    ...strings(WELCOME_EMAIL_COPY),
    ...strings(RESET_EMAIL_COPY),
    DIGEST_COPY.preheader('Monday, October 5, 2026'),
    DIGEST_COPY.subject('Oct 5', 'Chipmakers rise on strong orders'),
    DIGEST_COPY.subject('Oct 5', ''),
    DIGEST_COPY.navigator.decided('Monday, October 5, 2026'),
    ...ACTIONS.flatMap((action) => [true, false].flatMap((executed) => [0, 12].map((pct) => DIGEST_COPY.navigator.row(action, executed, pct)))),
    ...[0, 1, 7].map((n) => DIGEST_COPY.topics.newCount(n)),
    WELCOME_EMAIL_COPY.hero('Ada'),
    WELCOME_EMAIL_COPY.text('https://a.example.com/'),
    RESET_EMAIL_COPY.preheader(30),
    RESET_EMAIL_COPY.body('Ada', 30),
    RESET_EMAIL_COPY.text('https://a.example.com/r', 30),
];

describe('the email copy', () => {
    it('describes and never advises, in any line', () => {
        const all = rendered();
        expect(all.length).toBeGreaterThan(40);
        for (const text of all) {
            expect(text, text).not.toMatch(/undefined|NaN|null|\[object|Infinity/);
            expect(findBanned(text, 'copy'), text).toEqual([]);
        }
    });

    it('names AeroTrade and nothing older', () => {
        const all = rendered().join('\n');
        expect(all).toContain('AeroTrade');
        expect(all).not.toMatch(new RegExp(['algo', 'test'].join('[-_ ]?'), 'i'));
    });

    it('takes the practice balance from the constant the app uses', () => {
        expect(WELCOME_EMAIL_COPY.features[0]).toContain('$100,000');
    });

    it('tells what the AI Navigator did in the past tense, a full sale as the whole position', () => {
        expect(DIGEST_COPY.navigator.row('buy', true, 12)).toBe('Bought, toward 12% of the account');
        expect(DIGEST_COPY.navigator.row('buy', false, 12)).toBe('Planned to buy, toward 12% of the account');
        expect(DIGEST_COPY.navigator.row('sell', true, 0)).toBe('Sold the whole position');
        expect(DIGEST_COPY.navigator.row('hold', false, 40)).toBe('Kept, toward 40% of the account');
    });
});

describe('subjects', () => {
    it('are one line, clipped, with the headline only when there is one', () => {
        expect(DIGEST_COPY.subject('Oct 5', '')).toBe('AeroTrade daily brief · Oct 5');
        expect(DIGEST_COPY.subject('Oct 5', 'Fed holds')).toBe('AeroTrade daily brief · Oct 5: Fed holds');
        const long = DIGEST_COPY.subject('Oct 5', `Line one\nBcc: x@example.com\t${'y'.repeat(300)}`);
        expect(long).not.toMatch(/[\r\n\t]/);
        expect(long.length).toBeLessThanOrEqual(SUBJECT_MAX);
        expect(long.endsWith('…')).toBe(true);
        expect(oneLine('  a \u0000 b  ', 10)).toBe('a b');
    });
});
