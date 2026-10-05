// The email frame and its blocks: text is always escaped, an anchor is only ever an http(s) link,
// and every email is one light page with a hidden preview line and no placeholder left behind.

import {describe, expect, it} from 'vitest';
import {bulletList, button, card, cardTitle, chips, hero, isHttpUrl, linkOrText, paragraph, renderEmail, sectionLabel, sourceLine} from '@/lib/email/layout';
import {renderPasswordResetEmail, renderWelcomeEmail} from '@/lib/email/templates';
import {sanitizeWelcomeIntroHtml} from '@/lib/news/sanitize';
import {PAPER_STARTING_BALANCE} from '@/lib/trading/starting-balance';

const hrefsOf = (html: string): string[] => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);

describe('links', () => {
    it('makes an anchor only for an http(s) URL', () => {
        expect(isHttpUrl('https://a.example.com/x')).toBe(true);
        expect(isHttpUrl('http://a.example.com')).toBe(true);
        for (const bad of ['javascript:alert(1)', 'data:text/html,hi', '/relative', 'mailto:a@b.co', '']) {
            expect(isHttpUrl(bad), bad).toBe(false);
            expect(linkOrText(bad, 'Label <b>')).toBe('Label &lt;b&gt;');
        }
        expect(linkOrText('https://a.example.com/?q=1&r=2', 'Go')).toContain('href="https://a.example.com/?q=1&amp;r=2"');
    });

    it('prints a source line and chips with the same link rule', () => {
        const line = sourceLine('Read more', [{label: 'Wire', url: 'https://a.example.com'}, {label: 'Bad', url: 'javascript:x'}]);
        expect(hrefsOf(line)).toEqual(['https://a.example.com']);
        expect(line).toContain('Bad');
        expect(sourceLine('Read more', [])).toBe('');
        expect(hrefsOf(chips([{label: 'NVDA', url: 'https://a.example.com/stocks/NVDA'}]))).toEqual(['https://a.example.com/stocks/NVDA']);
        expect(chips([])).toBe('');
        expect(button('javascript:x', 'Go')).not.toContain('href');
    });
});

describe('blocks', () => {
    it('escapes every text argument', () => {
        for (const html of [hero('<x>'), sectionLabel('<x>'), cardTitle('<x>'), cardTitle('<x>', 'https://a.example.com'), paragraph('<x>')]) {
            expect(html).toContain('&lt;x&gt;');
            expect(html).not.toContain('<x>');
        }
    });

    it('leaves inline HTML a caller built alone', () => {
        expect(bulletList(['<strong>one</strong>'])).toContain('<strong>one</strong>');
        expect(card('<p>inside</p>', {accent: true})).toContain('<p>inside</p>');
        expect(bulletList([])).toBe('');
    });
});

describe('renderEmail', () => {
    const html = renderEmail({
        title: 'T & co', preheader: 'Preview <line>', kicker: 'Daily brief', barLine: 'Monday',
        bodyHtml: '<p>BODY</p>', footerLinks: [{label: 'Prefs', url: 'https://a.example.com/settings'}], footerLines: ['Why <you>'],
    });

    it('is one light page: the bar, the body, the footer, a hidden preview line', () => {
        expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
        expect(html).toContain('<title>T &amp; co</title>');
        expect(html).toContain('Preview &lt;line&gt;');
        expect(html).toMatch(/display: none;[^"]*">Preview/);
        expect(html).toContain('>AeroTrade<');
        expect(html).toContain('<p>BODY</p>');
        expect(html).toContain('Why &lt;you&gt;');
        expect(html).toContain('prefers-color-scheme: dark');
        expect(html).not.toMatch(/\{\{\w+\}\}/);
        expect(html).not.toMatch(/<img\b/);
    });
});

describe('the welcome and reset emails', () => {
    it('welcomes by name, escaped, with the practice balance and one way in', () => {
        const html = renderWelcomeEmail({appUrl: 'https://a.example.com/', name: '<Ada>', introHtml: sanitizeWelcomeIntroHtml('Thanks, <strong>tech</strong> fan.<script>x</script>')});
        expect(html).toContain('Welcome aboard, &lt;Ada&gt;');
        expect(html).toContain('<strong>tech</strong>');
        expect(html).not.toContain('<script>');
        expect(html).toContain(`$${PAPER_STARTING_BALANCE.toLocaleString('en-US')}`);
        expect(hrefsOf(html)).toEqual(['https://a.example.com/', 'https://a.example.com/', 'https://a.example.com/settings#notifications']);
    });

    it('carries the reset link as a button and as text, and names the expiry', () => {
        const resetUrl = 'https://a.example.com/reset-password?token=abc%2B1';
        const html = renderPasswordResetEmail({appUrl: 'https://a.example.com', name: '"Bob"', resetUrl, minutes: 30});
        expect(html).toContain('Hi &quot;Bob&quot;');
        expect(html).toContain('30 minutes');
        expect(hrefsOf(html).filter((h) => h === resetUrl)).toHaveLength(2);
        expect(html).toContain(`>${resetUrl}</a>`);
    });
});
