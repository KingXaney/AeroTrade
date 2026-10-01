import {afterEach, describe, expect, it, vi} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {
    conceptForTerm,
    GLOSSARY,
    GLOSSARY_KEYS,
    isGlossaryKey,
    lookupTerm,
    resolveTerm,
    searchGlossary,
    shortHelp,
} from '@/lib/learn/glossary';
import {STARTER_TOPICS} from '@/lib/topics/starters';

const SHORT_MAX = 140;

describe('GLOSSARY', () => {
    it('fills every entry and keeps the tooltip text short', () => {
        for (const key of GLOSSARY_KEYS) {
            const entry = GLOSSARY[key];
            expect(entry.key).toBe(key);
            expect(entry.term.trim().length).toBeGreaterThan(0);
            expect(entry.short.trim().length).toBeGreaterThan(0);
            expect(entry.short.length, key).toBeLessThanOrEqual(SHORT_MAX);
            expect(entry.long.trim().length, key).toBeGreaterThan(entry.short.length / 2);
            expect(entry.short.endsWith('.'), key).toBe(true);
        }
    });

    it('keeps keys unique and lower-case, with no alias shared between entries', () => {
        expect(new Set(GLOSSARY_KEYS).size).toBe(GLOSSARY_KEYS.length);
        const seen = new Map<string, string>();
        for (const key of GLOSSARY_KEYS) {
            expect(key).toBe(key.toLowerCase());
            for (const alias of GLOSSARY[key].aliases) {
                const owner = seen.get(alias.toLowerCase());
                expect(owner, `alias "${alias}" on ${key} and ${owner}`).toBeUndefined();
                seen.set(alias.toLowerCase(), key);
            }
        }
    });

    it('resolves every seeAlso to an entry', () => {
        for (const key of GLOSSARY_KEYS) {
            for (const other of GLOSSARY[key].seeAlso ?? []) {
                expect(isGlossaryKey(other), `${key} → ${other}`).toBe(true);
            }
        }
    });

    it('describes and never advises', () => {
        for (const key of GLOSSARY_KEYS) {
            const entry = GLOSSARY[key];
            expect(findBanned(`${entry.term}. ${entry.short} ${entry.long}`, 'copy'), key).toEqual([]);
        }
    });

    it('cites a formula or the computing function for every metric that has one', () => {
        for (const key of ['max-drawdown', 'cagr', 'volatility', 'avg-cost', 'realized-pnl', 'rsi2', 'vol63'] as const) {
            expect(GLOSSARY[key].formula ?? GLOSSARY[key].computedIn).toBeTruthy();
        }
    });

    it('keys every concept to a starter-topic keyword so a matched term is a glossary key', () => {
        const keywords = new Set(STARTER_TOPICS.flatMap((topic) => topic.keywords.map((k) => k.toLowerCase())));
        const concepts = Object.values(GLOSSARY).filter((entry) => entry.kind === 'concept');
        for (const entry of concepts) {
            expect(keywords.has(entry.key), entry.key).toBe(true);
        }
        expect(concepts.length).toBeGreaterThanOrEqual(20);
    });

    it('lists the keys a review can diff', () => {
        expect(GLOSSARY_KEYS.slice(0, 3)).toEqual(['close', 'since-entry', 'weight']);
        expect(GLOSSARY_KEYS).toContain('max-drawdown');
        expect(GLOSSARY_KEYS).toContain('pe-ratio');
        expect(GLOSSARY_KEYS).toContain('fomc');
        expect(GLOSSARY_KEYS.length).toBeGreaterThanOrEqual(70);
    });
});

describe('lookups', () => {
    it('reads a key straight', () => {
        expect(shortHelp('cagr')).toMatch(/Compound annual growth rate/);
        expect(lookupTerm('cagr')?.term).toBe('CAGR');
        expect(lookupTerm('nope')).toBeNull();
    });

    it('resolves a question, an alias and a bare term', () => {
        expect(resolveTerm('What does my max drawdown mean?')?.key).toBe('max-drawdown');
        expect(resolveTerm('P/E')?.key).toBe('pe-ratio');
        expect(resolveTerm('pe ratio')?.key).toBe('pe-ratio');
        expect(resolveTerm('explain the 200-day moving average')?.key).toBe('sma200');
        expect(resolveTerm('what is a rate cut')?.key).toBe('rate cut');
        expect(resolveTerm('')).toBeNull();
        expect(resolveTerm('quantum flux capacitor')).toBeNull();
    });

    it('prefers the longest matching phrase', () => {
        expect(resolveTerm('dividend yield')?.key).toBe('dividend-yield');
        expect(resolveTerm('fed funds rate')?.key).toBe('fed funds rate');
    });

    it('ranks palette hits by prefix, then substring, and caps them', () => {
        expect(searchGlossary('draw').map((e) => e.key)).toEqual(['max-drawdown']);
        expect(searchGlossary('sma')[0].key).toMatch(/^sma/);
        expect(searchGlossary('rate').length).toBeLessThanOrEqual(5);
        expect(searchGlossary('r')).toEqual([]);
        expect(searchGlossary('zzzz')).toEqual([]);
    });

    it('maps a matched article term to a concept and a name to nothing', () => {
        expect(conceptForTerm('fomc')?.key).toBe('fomc');
        expect(conceptForTerm('federal reserve')?.key).toBe('fomc');
        expect(conceptForTerm('nvidia')).toBeNull();
        expect(conceptForTerm('max drawdown')).toBeNull();
    });
});

describe('the rails the glossary quotes', () => {
    afterEach(() => {
        vi.doUnmock('@/lib/navigator/config');
        vi.doUnmock('@/lib/strategies/config');
        vi.resetModules();
    });

    it('states the Navigator\'s cap and floor and the strategies\' band as their constants are today', () => {
        expect(GLOSSARY['position-cap'].short).toBe('The largest share of the account the AI Navigator allows in one name: 20%.');
        expect(GLOSSARY['position-cap'].long).toContain('will not put more than a fifth of the account in it');
        expect(GLOSSARY['cash-floor'].short).toBe('The share of the account the AI Navigator always keeps in cash: 10%.');
        expect(GLOSSARY.concentration.long).toContain('caps itself at 20% per name');
        expect(GLOSSARY.drift.long).toContain('exceeds the band (2% of equity)');
    });

    it('moves each figure with its constant', async () => {
        vi.resetModules();
        vi.doMock('@/lib/navigator/config', async (importOriginal) => ({
            ...(await importOriginal<typeof import('@/lib/navigator/config')>()),
            MAX_POSITION_WEIGHT: 0.17,
            MIN_CASH_WEIGHT: 0.13,
        }));
        vi.doMock('@/lib/strategies/config', async (importOriginal) => ({
            ...(await importOriginal<typeof import('@/lib/strategies/config')>()),
            DEFAULT_DRIFT_BAND: 0.035,
        }));
        const mocked = (await import('@/lib/learn/glossary')).GLOSSARY;
        expect(mocked['position-cap'].short).toBe('The largest share of the account the AI Navigator allows in one name: 17%.');
        expect(mocked['position-cap'].long).toContain('will not put more than 17% of the account in it');
        expect(mocked['cash-floor'].short).toBe('The share of the account the AI Navigator always keeps in cash: 13%.');
        expect(mocked.concentration.long).toContain('caps itself at 17% per name');
        expect(mocked.drift.long).toContain('exceeds the band (4% of equity)');
        for (const key of ['position-cap', 'cash-floor', 'concentration', 'drift'] as const) {
            expect(findBanned(`${mocked[key].short} ${mocked[key].long}`, 'copy'), key).toEqual([]);
        }
    });
});
