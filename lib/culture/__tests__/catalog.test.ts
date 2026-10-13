// The brand catalog is the culture brain's universe and the only place a ticker can enter it,
// so its rules are held here: every id, alias, article title and app name is unique; every
// owner's ticker has the shape the fill path accepts; a generic word is never a plain alias.

import {describe, expect, it} from 'vitest';
import {aliasTerm, brandById, brandsByTicker, catalogTickers, CATEGORY_LABELS, CULTURE_BRANDS} from '@/lib/culture/catalog';
import {CULTURE_CATEGORIES} from '@/lib/culture/types';
import {findBanned} from '@/lib/learn/banned';

// The first commit's floor; raise it as the catalog grows.
const CATALOG_MIN_SIZE = 150;

const TICKER = /^[A-Z.]{1,5}$/;
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

// Words that are brands only in their cased form: a plain alias on one of these would count
// every ordinary use of the word as the brand.
const GENERIC_WORDS = new Set([
    'on', 'gap', 'target', 'coach', 'prime', 'boost', 'monster', 'max', 'switch', 'apple', 'kick',
    'supreme', 'truly', 'bumble', 'tinder', 'peacock', 'sprite', 'coke', 'affirm', 'chime',
    'patagonia', 'puma', 'vans', 'barbie', 'nyx', 'yeti', 'celsius', 'lego', 'skims', 'nerds',
    'goldfish', 'threads', 'discord', 'uber', 'twitch', 'equinox', 'whoop', 'cava', 'ugg', 'quest',
    'shop', 'bloom', 'ghost', 'bang', 'steam', 'beats', 'hinge', 'hbo', 'hims', 'rhode', 'stanley',
    'the ordinary', 'x', 'bubble', 'free', 'old', 'life', 'navy',
]);

const lower = (value: string) => value.toLowerCase();

describe('the brand catalog', () => {
    it('is large enough to be a universe', () => {
        expect(CULTURE_BRANDS.length).toBeGreaterThanOrEqual(CATALOG_MIN_SIZE);
    });

    it('gives every brand a unique kebab id and a unique short name', () => {
        const ids = CULTURE_BRANDS.map((b) => b.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const id of ids) expect(id, id).toMatch(KEBAB);
        const names = CULTURE_BRANDS.map((b) => lower(b.name));
        expect(new Set(names).size).toBe(names.length);
        for (const brand of CULTURE_BRANDS) {
            expect(brand.name.length, brand.id).toBeLessThanOrEqual(40);
            expect(brand.name, brand.id).not.toMatch(/[<>]/);
        }
    });

    it('keeps every category one of the fourteen, each with a label', () => {
        for (const brand of CULTURE_BRANDS) expect(CULTURE_CATEGORIES, brand.id).toContain(brand.category);
        for (const category of CULTURE_CATEGORIES) expect(CATEGORY_LABELS[category]).toBeTruthy();
        // Every category is used: an empty category would draw nothing on the board.
        for (const category of CULTURE_CATEGORIES) {
            expect(CULTURE_BRANDS.some((b) => b.category === category), category).toBe(true);
        }
    });

    it('lists at least one alias per brand, each term once across the catalog', () => {
        const seen = new Map<string, string>();
        for (const brand of CULTURE_BRANDS) {
            expect(brand.aliases.length, brand.id).toBeGreaterThan(0);
            for (const alias of brand.aliases) {
                const term = aliasTerm(alias);
                const key = lower(term.trim());
                expect(term.trim(), `${brand.id} has a blank alias`).toBe(term);
                // One brand may list a word in several casings; two brands may not share a word.
                const owner = seen.get(key);
                expect(owner === undefined || owner === brand.id, `alias "${term}" is listed by ${owner} and ${brand.id}`).toBe(true);
                seen.set(key, brand.id);
                if (typeof alias === 'string') {
                    expect(term.length, `${brand.id}: "${term}" is too short to be a plain alias`).toBeGreaterThanOrEqual(3);
                    expect(GENERIC_WORDS.has(key), `${brand.id}: "${term}" is a generic word and needs a cased alias`).toBe(false);
                } else {
                    expect(term.length, `${brand.id}: cased "${term}"`).toBeGreaterThanOrEqual(2);
                    expect(term, `${brand.id}: a cased alias carries a capital`).not.toBe(lower(term));
                }
            }
        }
    });

    it("gives every listed owner a ticker the fill path accepts, and dates a changed owner", () => {
        for (const brand of CULTURE_BRANDS) {
            if (!brand.owner) {
                continue;
            }
            expect(brand.owner.ticker, brand.id).toMatch(TICKER);
            expect(['us', 'adr', 'otc'], brand.id).toContain(brand.owner.listing);
            expect(brand.owner.company.length, brand.id).toBeGreaterThan(1);
            if (brand.owner.since) expect(brand.owner.since, brand.id).toMatch(DAY);
        }
        // The same ticker always names the same company.
        const companyByTicker = new Map<string, string>();
        for (const brand of CULTURE_BRANDS) {
            if (!brand.owner) continue;
            const known = companyByTicker.get(brand.owner.ticker);
            if (known) expect(known, brand.id).toBe(brand.owner.company);
            companyByTicker.set(brand.owner.ticker, brand.owner.company);
        }
    });

    it('names each Wikipedia article once, as the pageviews API wants it', () => {
        const seen = new Set<string>();
        for (const brand of CULTURE_BRANDS) {
            expect(brand.wikipedia.length, brand.id).toBeGreaterThan(0);
            for (const title of brand.wikipedia) {
                expect(title, brand.id).not.toMatch(/[\s#?]/);
                expect(seen.has(title), `${brand.id}: ${title} is listed twice`).toBe(false);
                seen.add(title);
            }
        }
    });

    it('maps an App Store app or artist to one brand only', () => {
        const artists = new Set<string>();
        const apps = new Set<string>();
        for (const brand of CULTURE_BRANDS) {
            for (const artist of brand.appArtists ?? []) {
                expect(artists.has(lower(artist)), `${brand.id}: artist ${artist}`).toBe(false);
                artists.add(lower(artist));
            }
            for (const app of brand.appNames ?? []) {
                expect(apps.has(lower(app)), `${brand.id}: app ${app}`).toBe(false);
                apps.add(lower(app));
            }
        }
    });

    it('names nothing in words that would read as advice on the page', () => {
        for (const brand of CULTURE_BRANDS) {
            const text = [brand.name, ...brand.aliases.map(aliasTerm), brand.owner?.company ?? '', brand.parent ?? ''].join('. ');
            expect(findBanned(text, 'advice'), brand.id).toEqual([]);
        }
    });

    it('tracks private brands for context, with a parent where one is known', () => {
        const privateBrands = CULTURE_BRANDS.filter((b) => b.owner === null);
        expect(privateBrands.length).toBeGreaterThan(20);
        expect(privateBrands.map((b) => b.id)).toContain('tiktok');
        expect(brandById('tiktok')?.parent).toBe('ByteDance');
    });

    it('groups brands under their ticker and lists each ticker once', () => {
        const byTicker = brandsByTicker();
        expect(byTicker.get('PEP')?.map((b) => b.id)).toEqual(expect.arrayContaining(['gatorade', 'poppi', 'pepsi', 'doritos']));
        expect(byTicker.has('TIKTOK')).toBe(false);
        const tickers = catalogTickers();
        expect(new Set(tickers.map((t) => t.ticker)).size).toBe(tickers.length);
        expect(tickers.map((t) => t.ticker)).toEqual([...tickers.map((t) => t.ticker)].sort((a, b) => a.localeCompare(b)));
        for (const row of tickers) expect(row.brands.length, row.ticker).toBeGreaterThan(0);
        expect(tickers.length).toBeGreaterThanOrEqual(90);
        expect(tickers.find((t) => t.ticker === 'CELH')?.brands).toEqual(['celsius', 'alani-nu']);
    });

    it('answers brandById for a known id and not for a stranger', () => {
        expect(brandById('celsius')?.owner?.ticker).toBe('CELH');
        expect(brandById('no-such-brand')).toBeUndefined();
    });
});
