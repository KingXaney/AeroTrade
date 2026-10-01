import {describe, expect, it} from 'vitest';
import {showSummary} from '@/lib/news/article';

describe('showSummary', () => {
    const headline = 'Fed holds rates steady as inflation cools';

    it('shows a summary that says more than the headline', () => {
        expect(showSummary(headline, 'Policymakers signalled two cuts later this year.')).toBe(true);
    });

    it('hides a missing or blank summary', () => {
        expect(showSummary(headline, undefined)).toBe(false);
        expect(showSummary(headline, null)).toBe(false);
        expect(showSummary(headline, '   ')).toBe(false);
        expect(showSummary(headline, '...')).toBe(false);
    });

    it('hides a summary equal to the headline', () => {
        expect(showSummary(headline, headline)).toBe(false);
        expect(showSummary(`  ${headline} `, `${headline}  `)).toBe(false);
    });

    it('hides a summary that is a prefix of the headline', () => {
        expect(showSummary(headline, 'Fed holds rates')).toBe(false);
    });

    it('hides a cut of the headline closed with "..." or "…"', () => {
        expect(showSummary(headline, `${headline}...`)).toBe(false);
        expect(showSummary(headline, 'Fed holds rates steady as...')).toBe(false);
        expect(showSummary(headline, 'Fed holds rates steady as…')).toBe(false);
        expect(showSummary(headline, 'Fed holds rates steady as… ')).toBe(false);
    });

    it('shows a cut summary the headline does not start with', () => {
        expect(showSummary(headline, 'Markets rallied after the decision...')).toBe(true);
        expect(showSummary(headline, 'Markets rallied after the decision…')).toBe(true);
    });
});
