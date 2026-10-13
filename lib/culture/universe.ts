// Which symbols the weekly run scores, and which of them may become targets. Pure. The catalog's
// distinct listed owners are the raw universe; a quote check (lib/culture/picker-store) says
// which trade this week; a name a picker holds is scored for its exit even when its quote is
// gone, but only a quoted name can be bought.

import {CULTURE_BRANDS} from "@/lib/culture/catalog";
import {MAX_UNIVERSE_TICKERS} from "@/lib/culture/config";
import {hashId} from "@/lib/text";
import type {CultureBrand, CultureCategory, Listing} from "@/lib/culture/types";

export type CultureTicker = {
    symbol: string;
    listing: Listing;
    company: string;
    brands: {id: string; name: string; category: CultureCategory}[];
};

// Every listed owner once, A→Z, with the brands it owns.
export const cultureTickers = (catalog: readonly CultureBrand[] = CULTURE_BRANDS): CultureTicker[] => {
    const byTicker = new Map<string, CultureTicker>();
    for (const brand of catalog) {
        if (!brand.owner) continue;
        const entry = byTicker.get(brand.owner.ticker) ?? {symbol: brand.owner.ticker, listing: brand.owner.listing, company: brand.owner.company, brands: []};
        entry.brands.push({id: brand.id, name: brand.name, category: brand.category});
        byTicker.set(brand.owner.ticker, entry);
    }
    return [...byTicker.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
};

// A fingerprint of which brand belongs to which owner: the backtest's rebuild key.
export const catalogHash = (catalog: readonly CultureBrand[] = CULTURE_BRANDS): string =>
    hashId(catalog.filter((brand) => brand.owner).map((brand) => `${brand.id}:${brand.owner!.ticker}`).sort().join('|')).toString(16);

const LISTING_ORDER: Record<Listing, number> = {us: 0, adr: 1, otc: 2};

// The tickers a week verifies, bounded: US listings first, then ADRs, then OTC, each group by
// its brands' slow attention, so a cap cuts the quietest over-the-counter names first.
export const orderUniverse = (
    tickers: readonly CultureTicker[],
    attentionBySymbol: ReadonlyMap<string, number>,
    max: number = MAX_UNIVERSE_TICKERS,
): CultureTicker[] =>
    [...tickers]
        .sort((a, b) =>
            LISTING_ORDER[a.listing] - LISTING_ORDER[b.listing]
            || (attentionBySymbol.get(b.symbol) ?? 0) - (attentionBySymbol.get(a.symbol) ?? 0)
            || a.symbol.localeCompare(b.symbol))
        .slice(0, Math.max(0, max));

export type VerifiedSymbol = {symbol: string; quoted: boolean; price: number | null; reason: 'ok' | 'no quote' | 'zero price' | 'error'};

// Arrays, not Sets: the universe crosses an Inngest step boundary as JSON.
export type CultureUniverse = {
    symbols: string[];
    targetable: string[];
    unquoted: VerifiedSymbol[];
    priceBySymbol: Record<string, number>;
};

export const selectCultureUniverse = (verified: readonly VerifiedSymbol[], held: readonly string[]): CultureUniverse => {
    const targetable = verified.filter((v) => v.quoted && v.price !== null).map((v) => v.symbol);
    const symbols = [...new Set([...targetable, ...held.map((s) => s.toUpperCase())])];
    const priceBySymbol: Record<string, number> = {};
    for (const v of verified) {
        if (v.quoted && v.price !== null) priceBySymbol[v.symbol] = v.price;
    }
    return {symbols, targetable, unquoted: verified.filter((v) => !v.quoted), priceBySymbol};
};
