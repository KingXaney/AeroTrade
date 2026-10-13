import {describe, expect, it} from 'vitest';
import {catalogHash, cultureTickers, orderUniverse, selectCultureUniverse} from '@/lib/culture/universe';
import type {CultureBrand} from '@/lib/culture/types';

const brand = (id: string, ticker: string | null, listing: 'us' | 'adr' | 'otc' = 'us'): CultureBrand =>
    ({id, name: id, category: 'drinks', aliases: [id], owner: ticker ? {company: `${ticker} Co`, ticker, listing} : null, wikipedia: [id]});

const CATALOG = [brand('poppi', 'PEP'), brand('gatorade', 'PEP'), brand('celsius', 'CELH'), brand('prime', null), brand('uniqlo', 'FRCOY', 'otc'), brand('temu', 'PDD', 'adr')];

describe('cultureTickers and catalogHash', () => {
    it('lists each listed owner once, A→Z, with its brands', () => {
        const tickers = cultureTickers(CATALOG);
        expect(tickers.map((t) => t.symbol)).toEqual(['CELH', 'FRCOY', 'PDD', 'PEP']);
        expect(tickers.find((t) => t.symbol === 'PEP')?.brands.map((b) => b.id)).toEqual(['poppi', 'gatorade']);
        expect(tickers.find((t) => t.symbol === 'FRCOY')?.listing).toBe('otc');
    });

    it('fingerprints who owns what, whatever the order, and moves when an owner changes', () => {
        const same = catalogHash([...CATALOG].reverse());
        expect(catalogHash(CATALOG)).toBe(same);
        expect(catalogHash([...CATALOG.filter((b) => b.id !== 'poppi'), brand('poppi', 'KO')])).not.toBe(same);
        expect(catalogHash([...CATALOG, brand('newprivate', null)])).toBe(same);
    });
});

describe('orderUniverse', () => {
    it('puts US listings first, then ADRs, then OTC, each by attention, and cuts at the cap', () => {
        const tickers = cultureTickers(CATALOG);
        const attention = new Map([['CELH', 9], ['PEP', 2]]);
        expect(orderUniverse(tickers, attention).map((t) => t.symbol)).toEqual(['CELH', 'PEP', 'PDD', 'FRCOY']);
        expect(orderUniverse(tickers, attention, 2).map((t) => t.symbol)).toEqual(['CELH', 'PEP']);
        expect(orderUniverse(tickers, new Map(), 0)).toEqual([]);
    });
});

describe('selectCultureUniverse', () => {
    it('targets only quoted names, scores held ones too, and keeps the prices and the unquoted', () => {
        const universe = selectCultureUniverse([
            {symbol: 'CELH', quoted: true, price: 40, reason: 'ok'},
            {symbol: 'PEP', quoted: true, price: 150, reason: 'ok'},
            {symbol: 'FRCOY', quoted: false, price: null, reason: 'no quote'},
        ], ['frcoy', 'ELF']);
        expect(universe.targetable).toEqual(['CELH', 'PEP']);
        expect(universe.symbols).toEqual(['CELH', 'PEP', 'FRCOY', 'ELF']);
        expect(universe.unquoted.map((u) => u.symbol)).toEqual(['FRCOY']);
        expect(universe.priceBySymbol).toEqual({CELH: 40, PEP: 150});
    });
});
