import {describe, expect, it} from 'vitest';
import {COMMENTARY_IMPORTANCE_SHARE} from '@/lib/brain/config';
import {COMMENTARY_OUTLETS, PRESS_RELEASE_OUTLETS, sourceTrust} from '@/lib/brain/trust';

describe('sourceTrust', () => {
    it('reads a press-release wire as the company speaking for itself, by name or by host', () => {
        for (const [source, url] of [
            ['PRNewswire', ''], ['PR Newswire', ''], ['Business Wire', ''], ['GlobeNewswire', ''], ['ACCESSWIRE', ''], ['Newsfile Corp', ''],
            ['Yahoo Finance', 'https://www.prnewswire.com/news-releases/acme-reports-q3.html'],
            ['Yahoo Finance', 'https://www.globenewswire.com/news-release/2026/10/06/acme.html'],
            ['Yahoo Finance', 'https://www.businesswire.com/news/home/2026/acme'],
            ['Finnhub', 'https://www.newsfilecorp.com/release/1234'],
        ]) {
            expect(sourceTrust(source, url), `${source} ${url}`).toEqual({importanceShare: 1, nature: 'company'});
        }
    });

    it('weighs a commentary outlet at its share and keeps the model\'s label', () => {
        for (const [source, url] of [
            ['Motley Fool', ''], ['The Motley Fool', ''], ['SeekingAlpha', ''], ['Seeking Alpha', ''], ['InvestorPlace', ''], ['Zacks', ''],
            ['TipRanks', ''], ['Simply Wall St', ''], ['GuruFocus', ''], ['24/7 Wall St.', ''],
            ['Yahoo Finance', 'https://www.fool.com/investing/2026/10/06/3-stocks-to-watch/'],
            ['Yahoo Finance', 'https://seekingalpha.com/article/1234-acme-is-a-buy'],
            ['Yahoo Finance', 'https://simplywall.st/stocks/us/acme'],
            ['Yahoo Finance', 'https://247wallst.com/investing/2026/10/06/acme/'],
        ]) {
            expect(sourceTrust(source, url), `${source} ${url}`).toEqual({importanceShare: COMMENTARY_IMPORTANCE_SHARE, nature: null});
        }
        expect(COMMENTARY_IMPORTANCE_SHARE).toBeGreaterThan(0);
        expect(COMMENTARY_IMPORTANCE_SHARE).toBeLessThan(1);
    });

    it('trusts every other outlet in full, including an empty name and an unparsable URL', () => {
        for (const [source, url] of [
            ['Reuters', ''], ['CNBC', 'https://www.cnbc.com/2026/10/06/acme.html'], ['MarketWatch', ''], ['Yahoo Finance', 'https://finance.yahoo.com/news/acme'],
            ['SEC EDGAR', 'https://www.sec.gov/Archives/edgar/data/1/0001-26-000001-index.htm'], ['r/wallstreetbets', ''], ['', ''], ['Bloomberg', 'not a url'],
            // A name that merely contains a listed word in another word is not a match.
            ['Foolproof Capital', ''], ['Businesswireless Weekly', ''],
        ]) {
            expect(sourceTrust(source, url), `${source} ${url}`).toEqual({importanceShare: 1, nature: null});
        }
    });

    it('keeps the two lists apart', () => {
        const releaseNames = ['PR Newswire', 'Business Wire', 'GlobeNewswire', 'Accesswire'];
        const commentaryNames = ['Motley Fool', 'Seeking Alpha', 'Zacks', 'TipRanks'];
        for (const name of releaseNames) expect(COMMENTARY_OUTLETS.some((p) => p.test(name)), name).toBe(false);
        for (const name of commentaryNames) expect(PRESS_RELEASE_OUTLETS.some((p) => p.test(name)), name).toBe(false);
    });
});
