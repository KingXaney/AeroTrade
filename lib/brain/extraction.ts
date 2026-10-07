// Zod schema + deterministic guards for LLM extraction output. The schema
// rejects malformed responses wholesale; sanitizeExtraction then enforces the
// invariants the model cannot be trusted to follow (ticker shape, sector
// whitelist, theme key convergence, bounded scores).

import {z} from "zod";
import {EXTRACTION_BATCH_SIZE, NATURES, REDDIT_IMPORTANCE_CAP, SECTOR_KEY_PREFIX, SECTOR_SLUGS, TAKE_IMPORTANCE_CAP, type Nature} from "@/lib/brain/config";
import {sourceTrust} from "@/lib/brain/trust";

export const ExtractionBatchSchema = z.object({
    articles: z.array(z.object({
        id: z.string(),
        eventType: z.enum(["earnings", "guidance", "mna", "product", "macro", "regulatory", "analyst", "legal", "other"]),
        // How the piece is written (lib/brain/config NATURES). Left out by an older model answer,
        // it reads as reported, which changes nothing.
        nature: z.enum(NATURES).default("reported"),
        importance: z.number().min(0).max(1),
        entities: z.array(z.object({
            key: z.string().max(60),
            type: z.enum(["ticker", "sector", "theme"]),
            sentiment: z.number().min(-1).max(1),
            relevance: z.number().min(0).max(1),
        })).max(8),
    })).max(EXTRACTION_BATCH_SIZE),
});

export type ExtractionBatch = z.infer<typeof ExtractionBatchSchema>;
export type ExtractedEntity = {key: string; type: "ticker" | "sector" | "theme"; sentiment: number; relevance: number};
type SanitizedExtraction = {id: string; eventType: ExtractionBatch["articles"][number]["eventType"]; nature: Nature; importance: number; entities: ExtractedEntity[]};
// Where a piece came from, for lib/brain/trust: the stored outlet name and the article's URL.
export type ArticleOutlet = {source: string; url?: string};

const TICKER_KEY_PATTERN = /^[A-Z.]{1,5}$/;
const THEME_MAX_WORDS = 3;
const THEME_KEY_PREFIX = "theme:";
const SENTIMENT_MIN = -1;
const SENTIMENT_MAX = 1;
const RELEVANCE_MIN = 0;
const RELEVANCE_MAX = 1;
const REDDIT_SOURCE_TYPE = "reddit";

// Set lookup avoids widening the SECTOR_SLUGS literal tuple at every call site.
const SECTOR_SLUG_SET: ReadonlySet<string> = new Set(SECTOR_SLUGS);

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

// LLM output wraps JSON in code fences unpredictably; JSON.parse needs the bare payload.
const stripCodeFences = (raw: string): string => {
    const trimmed = raw.trim();
    const fenced = trimmed.match(/^```[\w-]*\s*([\s\S]*?)\s*```$/);
    const inner = fenced?.[1];
    return inner !== undefined ? inner : trimmed;
};

export const parseExtractionResponse = (raw: string): ExtractionBatch | null => {
    let parsed: unknown;
    try {
        parsed = JSON.parse(stripCodeFences(raw));
    } catch {
        return null;
    }
    const result = ExtractionBatchSchema.safeParse(parsed);
    return result.success ? result.data : null;
};

// Kebab-case capped at THEME_MAX_WORDS so long-tail phrasings collapse onto short keys.
// A leading 'theme:' is stripped first — the model sometimes echoes stored keys, and
// normalizing the prefix into the slug would fork 'theme:theme-*' entities.
const normalizeThemeKey = (rawKey: string): string =>
    rawKey
        .replace(/^theme:/i, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .split("-")
        .filter((word) => word.length > 0)
        .slice(0, THEME_MAX_WORDS)
        .join("-");

// Prefer an existing active theme key so the graph converges instead of forking near-duplicates.
const resolveThemeKey = (rawKey: string, activeThemes: string[]): string | null => {
    const normalized = normalizeThemeKey(rawKey);
    if (normalized.length === 0) {
        return null;
    }
    const reused = activeThemes
        .map((theme) => normalizeThemeKey(theme))
        .find((theme) => theme.toLowerCase() === normalized.toLowerCase());
    return reused !== undefined ? reused : normalized;
};

const resolveEntityKey = (entity: ExtractedEntity, activeThemes: string[]): string | null => {
    if (entity.type === "ticker") {
        const upper = entity.key.toUpperCase();
        return TICKER_KEY_PATTERN.test(upper) ? upper : null;
    }
    if (entity.type === "sector") {
        const lower = entity.key.toLowerCase();
        return SECTOR_SLUG_SET.has(lower) ? `${SECTOR_KEY_PREFIX}${lower}` : null;
    }
    const themeKey = resolveThemeKey(entity.key, activeThemes);
    return themeKey === null ? null : `${THEME_KEY_PREFIX}${themeKey}`;
};

export const sanitizeExtraction = (
    article: ExtractionBatch["articles"][number],
    sourceType: string,
    activeThemes: string[],
    outlet: ArticleOutlet = {source: ""},
): SanitizedExtraction => {
    const seenKeys = new Set<string>();
    const entities: ExtractedEntity[] = [];
    for (const entity of article.entities) {
        const finalKey = resolveEntityKey(entity, activeThemes);
        if (finalKey === null || seenKeys.has(finalKey)) {
            continue;
        }
        seenKeys.add(finalKey);
        entities.push({
            key: finalKey,
            type: entity.type,
            sentiment: clamp(entity.sentiment, SENTIMENT_MIN, SENTIMENT_MAX),
            relevance: clamp(entity.relevance, RELEVANCE_MIN, RELEVANCE_MAX),
        });
    }
    // The outlet speaks first: a press-release wire settles the nature, a commentary outlet
    // weighs a share of the importance. Then the clamps — Reddit chatter systematically
    // overstates importance, and a take (an opinion piece or a rumour) counts at most
    // TAKE_IMPORTANCE_CAP, however the model rated it. A clamp only ever lowers a weight.
    const trust = sourceTrust(outlet.source, outlet.url);
    const nature = trust.nature ?? article.nature;
    let importance = article.importance * trust.importanceShare;
    if (sourceType === REDDIT_SOURCE_TYPE) importance = Math.min(importance, REDDIT_IMPORTANCE_CAP);
    if (nature === "opinion" || nature === "rumour") importance = Math.min(importance, TAKE_IMPORTANCE_CAP);
    return {id: article.id, eventType: article.eventType, nature, importance, entities};
};

export const buildDisplayName = (finalKey: string, type: "ticker" | "sector" | "theme"): string => {
    if (type === "ticker") {
        return finalKey;
    }
    const prefix = type === "sector" ? SECTOR_KEY_PREFIX : THEME_KEY_PREFIX;
    const bare = finalKey.startsWith(prefix) ? finalKey.slice(prefix.length) : finalKey;
    return bare
        .split("-")
        .filter((word) => word.length > 0)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
};
