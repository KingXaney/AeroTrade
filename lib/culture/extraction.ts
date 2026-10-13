// Reading the model's answer about a batch of items. The schema rejects a malformed answer
// wholesale; readCultureBatch then enforces what the model cannot be trusted to keep: an item
// number is used once, a brand id must be one the batch was shown, every number is clamped,
// an unknown signal is 'other', Reddit's importance is capped, and a suggested brand name is
// cleaned and dropped when the catalog already has it. Pure (invariant 4).

import {z} from "zod";
import {cleanText, stripFences} from "@/lib/ai/cited";
import {REDDIT_IMPORTANCE_CAP} from "@/lib/brain/config";
import {
    CULTURE_MAX_BRANDS_PER_ITEM,
    CULTURE_MAX_NEW_BRANDS_PER_ITEM,
    CULTURE_SUGGESTION_NAME_CHARS,
} from "@/lib/culture/config";
import {CULTURE_SIGNALS, type CultureItemSource, type CultureMention, type CultureSignal} from "@/lib/culture/types";

// Lenient on purpose: a model that lists seven brands or twenty-one items loses the excess in
// readCultureBatch, not the whole batch.
export const CultureBatchSchema = z.object({
    items: z.array(z.object({
        n: z.number().int(),
        importance: z.number(),
        signal: z.string(),
        brands: z.array(z.object({
            id: z.string().max(60),
            sentiment: z.number(),
            relevance: z.number(),
        })).default([]),
        newBrands: z.array(z.string().max(120)).default([]),
    })),
});

export type CultureBatch = z.infer<typeof CultureBatchSchema>;

export const parseCultureResponse = (raw: string): CultureBatch | null => {
    let parsed: unknown;
    try {
        parsed = JSON.parse(stripFences(raw));
    } catch {
        return null;
    }
    const result = CultureBatchSchema.safeParse(parsed);
    return result.success ? result.data : null;
};

// What the batch step knows about each item it showed the model.
export type BatchItemRef = {n: number; id: string; source: CultureItemSource};

export type SanitizedCultureItem = {
    itemId: string;
    source: CultureItemSource;
    importance: number;
    signal: CultureSignal;
    brands: CultureMention[];
    newBrands: string[];
};

const SIGNAL_SET: ReadonlySet<string> = new Set(CULTURE_SIGNALS);
// A brand name as people write one: letters and digits, spaces, an ampersand, an apostrophe,
// a dot or a hyphen — nothing that could carry markup or a symbol.
const NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} &'.\-]*$/u;

const clamp = (value: number, min: number, max: number): number =>
    Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;

export const cleanBrandName = (raw: unknown): string | null => {
    const name = cleanText(raw, CULTURE_SUGGESTION_NAME_CHARS).trim();
    return name.length >= 2 && NAME_PATTERN.test(name) ? name : null;
};

// One batch's answer, item by item, against the batch it was asked about.
export const readCultureBatch = (
    parsed: CultureBatch,
    batch: readonly BatchItemRef[],
    {allowedIds, isCatalogName}: {allowedIds: ReadonlySet<string>; isCatalogName: (name: string) => boolean},
): SanitizedCultureItem[] => {
    const refByN = new Map(batch.map((ref) => [ref.n, ref]));
    const out: SanitizedCultureItem[] = [];
    for (const item of parsed.items) {
        // Consume-once: a made-up n and a duplicated n are both skipped.
        const ref = refByN.get(item.n);
        if (!ref) continue;
        refByN.delete(item.n);

        const seen = new Set<string>();
        const brands: CultureMention[] = [];
        for (const brand of item.brands) {
            if (!allowedIds.has(brand.id) || seen.has(brand.id)) continue;
            seen.add(brand.id);
            brands.push({key: brand.id, sentiment: clamp(brand.sentiment, -1, 1), relevance: clamp(brand.relevance, 0, 1)});
            if (brands.length >= CULTURE_MAX_BRANDS_PER_ITEM) break;
        }

        const seenNames = new Set<string>();
        const newBrands: string[] = [];
        for (const raw of item.newBrands) {
            const name = cleanBrandName(raw);
            if (!name || seenNames.has(name.toLowerCase()) || isCatalogName(name)) continue;
            seenNames.add(name.toLowerCase());
            newBrands.push(name);
            if (newBrands.length >= CULTURE_MAX_NEW_BRANDS_PER_ITEM) break;
        }

        const importance = clamp(item.importance, 0, 1);
        out.push({
            itemId: ref.id,
            source: ref.source,
            // Reddit chatter overstates its own importance, so it is capped as the news brain caps it.
            importance: ref.source === 'reddit' ? Math.min(importance, REDDIT_IMPORTANCE_CAP) : importance,
            signal: SIGNAL_SET.has(item.signal) ? (item.signal as CultureSignal) : 'other',
            brands,
            newBrands,
        });
    }
    return out;
};
