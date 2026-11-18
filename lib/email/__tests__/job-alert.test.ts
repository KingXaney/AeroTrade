// The owner's alert email: its text is escaped, its one link is the system view.

import {describe, expect, it} from 'vitest';
import {renderJobAlertEmail} from '@/lib/email/templates';

const render = (over: Partial<Parameters<typeof renderJobAlertEmail>[0]> = {}) => renderJobAlertEmail({
    appUrl: 'https://app.example.com/',
    title: 'AeroTrade: the Account snapshots job failed',
    preheader: 'Account snapshots stopped with an error after its retries.',
    headline: 'The Account snapshots job failed',
    lines: ['It runs weekdays 16:10 ET.', 'Its last completed run was 2 days ago.'],
    error: 'fetch failed',
    ...over,
});

describe('renderJobAlertEmail', () => {
    it('prints the headline, each line and the error', () => {
        const html = render();
        expect(html).toContain('The Account snapshots job failed');
        expect(html).toContain('It runs weekdays 16:10 ET.');
        expect(html).toContain('Its last completed run was 2 days ago.');
        expect(html).toContain('fetch failed');
    });

    it('escapes an error message, whatever a job threw', () => {
        const html = render({error: '<script>alert(1)</script> & <a href="https://evil.example">x</a>'});
        expect(html).not.toContain('<script>');
        expect(html).not.toContain('evil.example">');
        expect(html).toContain('&lt;script&gt;');
    });

    it('links to the system view and nowhere a job could name', () => {
        const html = render({lines: ['See https://evil.example/now']});
        const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
        expect(hrefs).toContain('https://app.example.com/brain?view=system');
        expect(hrefs.every((href) => href.startsWith('https://app.example.com/'))).toBe(true);
    });

    it('leaves the error line out of an overdue mail', () => {
        expect(render({error: undefined})).not.toContain('Error:');
    });
});
