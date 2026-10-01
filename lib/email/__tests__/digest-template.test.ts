// The daily digest's template: the lesson section rides under the topics section, and filling
// the template leaves no placeholder behind — whatever the sections contain.

import {describe, expect, it} from 'vitest';
import {NEWS_SUMMARY_EMAIL_TEMPLATE, renderNewsSummaryEmail} from '@/lib/email/templates';

describe('renderNewsSummaryEmail', () => {
    const sections = {
        appUrl: 'https://app.example.com',
        date: 'Wednesday, September 30, 2026',
        newsContent: '<p>NEWS</p>',
        topicsSection: '<h2>TOPICS</h2>',
        lessonSection: '<h2>LESSON</h2>',
    };

    it('places the lesson section after the topics section, after the news', () => {
        expect(NEWS_SUMMARY_EMAIL_TEMPLATE.indexOf('{{topicsSection}}')).toBeGreaterThan(NEWS_SUMMARY_EMAIL_TEMPLATE.indexOf('{{newsContent}}'));
        expect(NEWS_SUMMARY_EMAIL_TEMPLATE.indexOf('{{lessonSection}}')).toBeGreaterThan(NEWS_SUMMARY_EMAIL_TEMPLATE.indexOf('{{topicsSection}}'));
        const html = renderNewsSummaryEmail(sections);
        expect(html.indexOf('NEWS')).toBeLessThan(html.indexOf('TOPICS'));
        expect(html.indexOf('TOPICS')).toBeLessThan(html.indexOf('LESSON'));
    });

    it('leaves no placeholder, with or without the optional sections', () => {
        for (const html of [renderNewsSummaryEmail(sections), renderNewsSummaryEmail({...sections, topicsSection: '', lessonSection: ''})]) {
            expect(html).not.toMatch(/\{\{\w+\}\}/);
        }
        expect(renderNewsSummaryEmail(sections)).toContain('href="https://app.example.com/settings#notifications"');
    });

    it('inserts the sections verbatim — no replacement pattern expands — and escapes the date', () => {
        const html = renderNewsSummaryEmail({...sections, lessonSection: '<p>$& $1 $$</p>', date: '<b>Sep 30</b>'});
        expect(html).toContain('<p>$& $1 $$</p>');
        expect(html).toContain('&lt;b&gt;Sep 30&lt;/b&gt;');
    });
});
