// getAggregatedNews behavior with all four adapters mocked — isolation, dedupe, caps, ordering, mode gating.

import {beforeEach, describe, expect, it, vi} from "vitest";

vi.mock("@/lib/news/adapters/finnhub", () => ({fetchFinnhubNews: vi.fn()}));
vi.mock("@/lib/news/adapters/rss", () => ({fetchRssNews: vi.fn()}));
vi.mock("@/lib/news/adapters/reddit", () => ({fetchRedditNews: vi.fn()}));
vi.mock("@/lib/news/adapters/sec", () => ({fetchSecFilings: vi.fn()}));

import {fetchFinnhubNews} from "@/lib/news/adapters/finnhub";
import {fetchRedditNews} from "@/lib/news/adapters/reddit";
import {fetchRssNews} from "@/lib/news/adapters/rss";
import {fetchSecFilings} from "@/lib/news/adapters/sec";
import {getAggregatedNews} from "@/lib/news/aggregate";

const finnhubMock = vi.mocked(fetchFinnhubNews);
const rssMock = vi.mocked(fetchRssNews);
const redditMock = vi.mocked(fetchRedditNews);
const secMock = vi.mocked(fetchSecFilings);

// Monotonic counter keeps every generated headline/url/id unique so dedupe never fires by accident.
let uid = 0;

const BASE_DATETIME = 1700000000;

const makeArticle = (overrides: Partial<MarketNewsArticle> = {}): MarketNewsArticle => {
    uid += 1;
    return {
        id: uid,
        headline: `Headline ${uid}`,
        summary: `Summary ${uid}`,
        source: "Test Wire",
        url: `https://example.com/story-${uid}`,
        datetime: BASE_DATETIME + uid,
        category: "general",
        related: "",
        sourceType: "finance",
        ...overrides,
    };
};

const makeBatch = (count: number, sourceType: NewsSourceType, baseDatetime: number): MarketNewsArticle[] =>
    Array.from({length: count}, (_, i) => makeArticle({sourceType, datetime: baseDatetime + i}));

const idsAscending = (articles: MarketNewsArticle[]): number[] =>
    articles.map((article) => article.id).sort((a, b) => a - b);

describe("getAggregatedNews", () => {
    beforeEach(() => {
        uid = 0;
        vi.clearAllMocks();
        // Aggregation logs rejected sources — keep test output clean.
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        finnhubMock.mockResolvedValue([]);
        rssMock.mockResolvedValue([]);
        redditMock.mockResolvedValue([]);
        secMock.mockResolvedValue([]);
    });

    it("still returns the healthy sources' articles when one adapter rejects", async () => {
        const finance = [makeArticle(), makeArticle()];
        const reddit = [makeArticle({sourceType: "reddit"})];
        finnhubMock.mockResolvedValue(finance);
        redditMock.mockResolvedValue(reddit);
        rssMock.mockRejectedValue(new Error("rss is down"));

        const result = await getAggregatedNews({mode: "general"});

        expect(idsAscending(result)).toEqual(idsAscending([...finance, ...reddit]));
    });

    it("dedupes a duplicate URL across sources, keeping the first source's article", async () => {
        const financeArticle = makeArticle({url: "https://example.com/shared-story"});
        // Same story normalized: tracking query, trailing slash, and case differences must not defeat dedupe.
        const rssDuplicate = makeArticle({
            sourceType: "rss",
            url: "https://Example.com/shared-story/?utm_source=feed",
        });
        const rssUnique = makeArticle({sourceType: "rss"});
        finnhubMock.mockResolvedValue([financeArticle]);
        rssMock.mockResolvedValue([rssDuplicate, rssUnique]);

        const result = await getAggregatedNews({mode: "general"});

        expect(idsAscending(result)).toEqual(idsAscending([financeArticle, rssUnique]));
        const survivor = result.find((article) => article.id === financeArticle.id);
        expect(survivor?.sourceType).toBe("finance");
        expect(survivor?.url).toBe("https://example.com/shared-story");
    });

    it("enforces per-source caps, the total cap, and grouped newest-first ordering", async () => {
        finnhubMock.mockResolvedValue(makeBatch(8, "finance", 1000));
        rssMock.mockResolvedValue(makeBatch(8, "rss", 2000));
        redditMock.mockResolvedValue(makeBatch(6, "reddit", 3000));
        secMock.mockResolvedValue(makeBatch(6, "sec", 4000));

        const result = await getAggregatedNews({mode: "personalized", symbols: ["AAPL"]});

        // 8+8+6+6 -> per-source caps 6+6+4+4 = 20 -> total cap 16 trims reddit (noisiest) entirely.
        expect(result).toHaveLength(16);
        expect(result.map((article) => article.sourceType)).toEqual([
            "finance", "finance", "finance", "finance", "finance", "finance",
            "rss", "rss", "rss", "rss", "rss", "rss",
            "sec", "sec", "sec", "sec",
        ]);
        expect(result.some((article) => article.sourceType === "reddit")).toBe(false);

        // Caps keep the freshest articles, sorted datetime-desc inside each group.
        expect(result.slice(0, 6).map((article) => article.datetime)).toEqual([1007, 1006, 1005, 1004, 1003, 1002]);
        expect(result.slice(6, 12).map((article) => article.datetime)).toEqual([2007, 2006, 2005, 2004, 2003, 2002]);
        expect(result.slice(12).map((article) => article.datetime)).toEqual([4005, 4004, 4003, 4002]);
    });

    it("never calls fetchSecFilings in general mode and passes no symbols to other adapters", async () => {
        await getAggregatedNews({mode: "general", symbols: ["AAPL", "TSLA"]});

        expect(secMock).not.toHaveBeenCalled();
        expect(finnhubMock).toHaveBeenCalledWith(undefined);
        expect(rssMock).toHaveBeenCalledWith(undefined);
        expect(redditMock).toHaveBeenCalledWith(undefined);
    });

    it("calls fetchSecFilings with the symbols in personalized mode", async () => {
        await getAggregatedNews({mode: "personalized", symbols: ["AAPL", "TSLA"]});

        expect(secMock).toHaveBeenCalledWith(["AAPL", "TSLA"]);
        expect(finnhubMock).toHaveBeenCalledWith(["AAPL", "TSLA"]);
        expect(rssMock).toHaveBeenCalledWith(["AAPL", "TSLA"]);
        expect(redditMock).toHaveBeenCalledWith(["AAPL", "TSLA"]);
    });
});
