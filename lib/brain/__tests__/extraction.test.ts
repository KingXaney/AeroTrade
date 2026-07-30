import {describe, expect, it} from "vitest";
import {
    buildDisplayName,
    ExtractionBatchSchema,
    parseExtractionResponse,
    sanitizeExtraction,
} from "@/lib/brain/extraction";
import type {ExtractedEntity, ExtractionBatch} from "@/lib/brain/extraction";
import {EXTRACTION_BATCH_SIZE, REDDIT_IMPORTANCE_CAP} from "@/lib/brain/config";

type ExtractionArticle = ExtractionBatch["articles"][number];

const makeEntity = (overrides: Partial<ExtractedEntity> = {}): ExtractedEntity => ({
    key: "NVDA",
    type: "ticker",
    sentiment: 0.5,
    relevance: 0.8,
    ...overrides,
});

const makeArticle = (overrides: Partial<ExtractionArticle> = {}): ExtractionArticle => ({
    id: "article-1",
    eventType: "earnings",
    importance: 0.5,
    entities: [],
    ...overrides,
});

describe("ExtractionBatchSchema / parseExtractionResponse", () => {
    it("accepts a valid payload", () => {
        const batch = {articles: [makeArticle({entities: [makeEntity()]})]};
        const parsed = parseExtractionResponse(JSON.stringify(batch));
        expect(parsed).toEqual(batch);
    });

    it("parses JSON wrapped in ```json fences", () => {
        const batch = {articles: [makeArticle()]};
        const raw = "```json\n" + JSON.stringify(batch) + "\n```";
        expect(parseExtractionResponse(raw)).toEqual(batch);
    });

    it("parses JSON wrapped in bare ``` fences with surrounding whitespace", () => {
        const batch = {articles: []};
        const raw = "  \n```\n" + JSON.stringify(batch) + "\n```  \n";
        expect(parseExtractionResponse(raw)).toEqual(batch);
    });

    it("returns null for garbage input", () => {
        expect(parseExtractionResponse("the model said something chatty")).toBeNull();
    });

    it("returns null for truncated JSON", () => {
        expect(parseExtractionResponse('{"articles": [{"id": "a1", "event')).toBeNull();
    });

    it("returns null for valid JSON with the wrong shape", () => {
        expect(parseExtractionResponse('{"items": []}')).toBeNull();
        expect(parseExtractionResponse('[1, 2, 3]')).toBeNull();
        expect(parseExtractionResponse('"just a string"')).toBeNull();
    });

    it("rejects an unknown eventType", () => {
        const batch = {articles: [{...makeArticle(), eventType: "rumor"}]};
        expect(parseExtractionResponse(JSON.stringify(batch))).toBeNull();
    });

    it("rejects importance outside [0, 1]", () => {
        const batch = {articles: [{...makeArticle(), importance: 1.5}]};
        expect(ExtractionBatchSchema.safeParse(batch).success).toBe(false);
    });

    it("rejects sentiment outside [-1, 1]", () => {
        const batch = {articles: [makeArticle({entities: [{...makeEntity(), sentiment: -2}]})]};
        expect(ExtractionBatchSchema.safeParse(batch).success).toBe(false);
    });

    it("rejects more than 8 entities per article", () => {
        const entities = Array.from({length: 9}, (_, index) => makeEntity({key: `T${index}`}));
        const batch = {articles: [makeArticle({entities})]};
        expect(ExtractionBatchSchema.safeParse(batch).success).toBe(false);
    });

    it("rejects more than EXTRACTION_BATCH_SIZE articles", () => {
        const articles = Array.from({length: EXTRACTION_BATCH_SIZE + 1}, (_, index) =>
            makeArticle({id: `article-${index}`}));
        expect(ExtractionBatchSchema.safeParse({articles}).success).toBe(false);
    });
});

describe("sanitizeExtraction — ticker guards", () => {
    it("uppercases lowercase ticker keys", () => {
        const result = sanitizeExtraction(
            makeArticle({entities: [makeEntity({key: "nvda"})]}),
            "rss",
            [],
        );
        expect(result.entities).toHaveLength(1);
        expect(result.entities[0]?.key).toBe("NVDA");
    });

    it("drops ticker keys that fail the [A-Z.]{1,5} pattern", () => {
        const result = sanitizeExtraction(
            makeArticle({
                entities: [
                    makeEntity({key: "nvda123"}),
                    makeEntity({key: "TOOLONG!"}),
                    makeEntity({key: "BRK.B"}),
                ],
            }),
            "rss",
            [],
        );
        expect(result.entities.map((entity) => entity.key)).toEqual(["BRK.B"]);
    });
});

describe("sanitizeExtraction — sector guards", () => {
    it("lowercases and prefixes whitelisted sectors", () => {
        const result = sanitizeExtraction(
            makeArticle({entities: [makeEntity({key: "Energy", type: "sector"})]}),
            "rss",
            [],
        );
        expect(result.entities[0]?.key).toBe("sector:energy");
    });

    it("drops sectors not in the whitelist", () => {
        const result = sanitizeExtraction(
            makeArticle({entities: [makeEntity({key: "crypto", type: "sector"})]}),
            "rss",
            [],
        );
        expect(result.entities).toHaveLength(0);
    });
});

describe("sanitizeExtraction — theme guards", () => {
    it("normalizes theme keys to kebab-case", () => {
        const result = sanitizeExtraction(
            makeArticle({entities: [makeEntity({key: "AI Capex Boom!!", type: "theme"})]}),
            "rss",
            [],
        );
        expect(result.entities[0]?.key).toBe("theme:ai-capex-boom");
    });

    it("truncates themes with 4+ words to 3 words", () => {
        const result = sanitizeExtraction(
            makeArticle({entities: [makeEntity({key: "One Two Three Four Five", type: "theme"})]}),
            "rss",
            [],
        );
        expect(result.entities[0]?.key).toBe("theme:one-two-three");
    });

    it("drops themes that normalize to empty", () => {
        const result = sanitizeExtraction(
            makeArticle({entities: [makeEntity({key: "!!! ???", type: "theme"})]}),
            "rss",
            [],
        );
        expect(result.entities).toHaveLength(0);
    });

    it("reuses an active theme via case-insensitive match", () => {
        const result = sanitizeExtraction(
            makeArticle({entities: [makeEntity({key: "Ai CAPEX", type: "theme"})]}),
            "rss",
            ["AI-Capex", "rate-cuts"],
        );
        expect(result.entities[0]?.key).toBe("theme:ai-capex");
    });

    it("keeps the normalized key when no active theme matches", () => {
        const result = sanitizeExtraction(
            makeArticle({entities: [makeEntity({key: "quantum computing", type: "theme"})]}),
            "rss",
            ["ai-capex"],
        );
        expect(result.entities[0]?.key).toBe("theme:quantum-computing");
    });
});

describe("sanitizeExtraction — dedupe and clamps", () => {
    it("dedupes entities by final key, first wins", () => {
        const result = sanitizeExtraction(
            makeArticle({
                entities: [
                    makeEntity({key: "nvda", sentiment: 0.9}),
                    makeEntity({key: "NVDA", sentiment: -0.9}),
                ],
            }),
            "rss",
            [],
        );
        expect(result.entities).toHaveLength(1);
        expect(result.entities[0]?.sentiment).toBe(0.9);
    });

    it("clamps sentiment to [-1, 1] and relevance to [0, 1]", () => {
        const result = sanitizeExtraction(
            makeArticle({
                entities: [
                    makeEntity({key: "AAPL", sentiment: 5, relevance: 2}),
                    makeEntity({key: "MSFT", sentiment: -3, relevance: -0.5}),
                ],
            }),
            "rss",
            [],
        );
        expect(result.entities[0]?.sentiment).toBe(1);
        expect(result.entities[0]?.relevance).toBe(1);
        expect(result.entities[1]?.sentiment).toBe(-1);
        expect(result.entities[1]?.relevance).toBe(0);
    });

    it("caps importance for reddit sources", () => {
        const result = sanitizeExtraction(makeArticle({importance: 0.9}), "reddit", []);
        expect(result.importance).toBe(REDDIT_IMPORTANCE_CAP);
    });

    it("leaves reddit importance below the cap untouched", () => {
        const result = sanitizeExtraction(makeArticle({importance: 0.1}), "reddit", []);
        expect(result.importance).toBe(0.1);
    });

    it("does not cap importance for non-reddit sources", () => {
        const result = sanitizeExtraction(makeArticle({importance: 0.9}), "rss", []);
        expect(result.importance).toBe(0.9);
    });

    it("passes id and eventType through unchanged", () => {
        const result = sanitizeExtraction(
            makeArticle({id: "abc-123", eventType: "mna"}),
            "rss",
            [],
        );
        expect(result.id).toBe("abc-123");
        expect(result.eventType).toBe("mna");
    });
});

describe("buildDisplayName", () => {
    it("returns ticker keys unchanged", () => {
        expect(buildDisplayName("NVDA", "ticker")).toBe("NVDA");
        expect(buildDisplayName("BRK.B", "ticker")).toBe("BRK.B");
    });

    it("strips the sector prefix and title-cases", () => {
        expect(buildDisplayName("sector:energy", "sector")).toBe("Energy");
        expect(buildDisplayName("sector:consumer-staples", "sector")).toBe("Consumer Staples");
    });

    it("strips the theme prefix and title-cases each word", () => {
        expect(buildDisplayName("theme:ai-capex", "theme")).toBe("Ai Capex");
        expect(buildDisplayName("theme:rate-cut-hopes", "theme")).toBe("Rate Cut Hopes");
    });
});
