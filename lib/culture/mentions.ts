// Deterministic brand mentions: which catalog brands an item names, by whole-word alias
// matching. Pure. This is what counts on a day the model is unavailable, what decides which
// items the model is shown, and what keeps a suggested "new brand" from being one the catalog
// already has. An alias only ever becomes a regex through escapeRegExp (invariant 2).

import {aliasTerm, CULTURE_BRANDS} from "@/lib/culture/catalog";
import {termPattern} from "@/lib/topics/match";
import {MAX_MATCH_TEXT_CHARS} from "@/lib/topics/config";
import type {BrandAlias, CultureBrand, CultureItemSource} from "@/lib/culture/types";

export type CompiledBrand = {id: string; patterns: RegExp[]};

// A plain alias is the topics matcher's own pattern (Unicode word boundaries, a cashtag never
// fires, case-insensitive); a cased alias is the same boundaries with the case kept.
export const aliasPattern = (alias: BrandAlias): RegExp => {
    const plain = termPattern(aliasTerm(alias));
    return typeof alias === 'string' ? plain : new RegExp(plain.source, 'u');
};

const compiled = new WeakMap<readonly CultureBrand[], CompiledBrand[]>();

// Compiled once per catalog object and kept: the daily job matches thousands of items.
export const compileCatalog = (brands: readonly CultureBrand[] = CULTURE_BRANDS): CompiledBrand[] => {
    const known = compiled.get(brands);
    if (known) return known;
    const built = brands.map((brand) => ({id: brand.id, patterns: brand.aliases.map(aliasPattern)}));
    compiled.set(brands, built);
    return built;
};

const clip = (value: string): string => String(value ?? '').slice(0, MAX_MATCH_TEXT_CHARS);

// The brands an item mentions, each once, in catalog order. The title and the body are both
// read, each clipped so a long body stays linear work.
export const brandMentions = (text: {title: string; body: string}, brands: CompiledBrand[] = compileCatalog()): string[] => {
    const haystack = `${clip(text.title)}\n${clip(text.body)}`;
    const found: string[] = [];
    for (const brand of brands) {
        if (brand.patterns.some((pattern) => pattern.test(haystack))) found.push(brand.id);
    }
    return found;
};

// Whether a name the model proposed is already a catalog brand under some alias.
export const isCatalogName = (name: string, brands: CompiledBrand[] = compileCatalog()): boolean =>
    brandMentions({title: name, body: ''}, brands).length > 0;

export type MentionCount = {count: number; scoreSum: number};

// A day's mentions per brand per source: how many items named it, and the sum of their scores
// (Reddit upvotes, YouTube views) for the record.
export const countByBrand = (
    items: readonly {source: CultureItemSource; mentions: readonly string[]; score?: number}[],
): Map<string, Map<CultureItemSource, MentionCount>> => {
    const counts = new Map<string, Map<CultureItemSource, MentionCount>>();
    for (const item of items) {
        for (const brand of item.mentions) {
            const bySource = counts.get(brand) ?? new Map<CultureItemSource, MentionCount>();
            const current = bySource.get(item.source) ?? {count: 0, scoreSum: 0};
            bySource.set(item.source, {count: current.count + 1, scoreSum: current.scoreSum + (item.score ?? 0)});
            counts.set(brand, bySource);
        }
    }
    return counts;
};

// An item as the job carries it to the model (plain JSON between steps).
export type QueuedCultureItem = {
    id: string;
    contentHash: number;
    source: CultureItemSource;
    sourceName: string;
    title: string;
    body: string;
    mentions: string[];
    score?: number;
    datetime: number;
};

// What people said comes before what the press wrote: the model's few calls go to the items
// that name brands, co-mentions first (they draw links), behaviour sources before news, the
// most upvoted or viewed first. Unmatched items fill the rest, since they are where a brand
// the catalog lacks would be met.
const SOURCE_ORDER: Record<CultureItemSource, number> = {reddit: 0, youtube: 1, social: 2, news: 3};

const tierOf = (item: QueuedCultureItem): number => (item.mentions.length >= 2 ? 0 : item.mentions.length === 1 ? 1 : 2);

export const prioritizeQueue = (items: readonly QueuedCultureItem[], limit: number): QueuedCultureItem[] =>
    [...items]
        .sort((a, b) =>
            tierOf(a) - tierOf(b)
            || SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source]
            || (b.score ?? 0) - (a.score ?? 0)
            || b.datetime - a.datetime)
        .slice(0, Math.max(0, limit));
