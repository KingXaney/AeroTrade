// Pure-function coverage for the news adapters — no network, no mocks.

import {describe, expect, it} from "vitest";
import {parseRssXml} from "@/lib/news/adapters/rss";
import {mapRedditPost, matchTickers, type RedditPost} from "@/lib/news/adapters/reddit";
import {
    describeFiling,
    describeFilingItems,
    extractFilingText,
    looksInformative,
    mapEdgarEntry,
    pickFilingDocument,
    type EdgarEntry,
} from "@/lib/news/adapters/sec";
import {hashId} from "@/lib/news/config";

// Known-good reference instants so datetime assertions stay exact UNIX seconds.
const JAN_6_2025_NOON_UTC = 1736164800;
const JAN_7_2025_0930_UTC = 1736242200;
const EASTERN_OFFSET_SECONDS = 5 * 60 * 60;

const RSS_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
    <channel>
        <title>Test Feed</title>
        <item>
            <title><![CDATA[Fed cuts rates & markets rally]]></title>
            <description><![CDATA[<p>Stocks <b>rallied</b> hard.</p>]]></description>
            <link>https://example.com/cdata-story</link>
            <pubDate>Mon, 06 Jan 2025 12:00:00 GMT</pubDate>
        </item>
        <item>
            <title>No date item</title>
            <description>This item has no pubDate at all.</description>
            <link>https://example.com/no-date</link>
        </item>
    </channel>
</rss>`;

const ATOM_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
    <title>Atom Test</title>
    <entry>
        <title>Atom headline here</title>
        <summary>Atom summary text</summary>
        <link rel="alternate" href="https://example.com/atom-story"/>
        <updated>2025-01-06T12:00:00Z</updated>
    </entry>
</feed>`;

const SINGLE_ITEM_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
    <channel>
        <title>Solo Feed</title>
        <item>
            <title>Solo headline</title>
            <description>Solo description</description>
            <link>https://example.com/solo</link>
            <pubDate>Tue, 07 Jan 2025 09:30:00 GMT</pubDate>
        </item>
    </channel>
</rss>`;

describe("parseRssXml", () => {
    it("parses RSS 2.0, decoding CDATA titles and stripping HTML from descriptions", () => {
        const articles = parseRssXml(RSS_FIXTURE, "Test Source");

        // The pubDate-less second item is unparseable as a timestamp, so it is skipped.
        expect(articles).toHaveLength(1);
        expect(articles[0]).toMatchObject({
            id: hashId("https://example.com/cdata-story"),
            headline: "Fed cuts rates & markets rally",
            summary: "Stocks rallied hard.",
            source: "Test Source",
            url: "https://example.com/cdata-story",
            datetime: JAN_6_2025_NOON_UTC,
            category: "general",
        });
    });

    it("parses Atom feeds, reading the URL from the link href attribute", () => {
        const articles = parseRssXml(ATOM_FIXTURE, "Atom Source");

        expect(articles).toHaveLength(1);
        expect(articles[0]).toMatchObject({
            headline: "Atom headline here",
            summary: "Atom summary text",
            url: "https://example.com/atom-story",
            datetime: JAN_6_2025_NOON_UTC,
            source: "Atom Source",
        });
    });

    it("handles a single-item channel where the parser emits an object, not an array", () => {
        const articles = parseRssXml(SINGLE_ITEM_FIXTURE, "Solo Source");

        expect(articles).toHaveLength(1);
        expect(articles[0]).toMatchObject({
            headline: "Solo headline",
            summary: "Solo description",
            url: "https://example.com/solo",
            datetime: JAN_7_2025_0930_UTC,
        });
    });

    it("returns an empty array for garbage input", () => {
        expect(parseRssXml("complete garbage {{{ not xml at all", "Junk")).toEqual([]);
        expect(parseRssXml("", "Empty")).toEqual([]);
        expect(parseRssXml("<html><body>not a feed</body></html>", "Html")).toEqual([]);
    });
});

describe("mapRedditPost", () => {
    const basePost: RedditPost = {
        title: "  AAPL beats earnings  ",
        selftext: "Line one\n\nLine   two",
        permalink: "/r/stocks/comments/abc123/aapl_beats/",
        created_utc: 1700000123.9,
        score: 150,
    };

    it("maps a full post to a RawNewsArticle", () => {
        const article = mapRedditPost(basePost, "stocks");

        expect(article).toEqual({
            id: hashId("/r/stocks/comments/abc123/aapl_beats/"),
            headline: "AAPL beats earnings",
            summary: "Line one Line two",
            url: "https://www.reddit.com/r/stocks/comments/abc123/aapl_beats/",
            // Fractional created_utc must floor to whole UNIX seconds.
            datetime: 1700000123,
            source: "r/stocks",
            category: "social",
        });
    });

    it("falls back to the title as summary when selftext is empty or missing", () => {
        const emptyBody = mapRedditPost({...basePost, selftext: ""}, "stocks");
        expect(emptyBody.summary).toBe("AAPL beats earnings");

        const noBody = mapRedditPost({...basePost, selftext: undefined}, "wallstreetbets");
        expect(noBody.summary).toBe("AAPL beats earnings");
        expect(noBody.source).toBe("r/wallstreetbets");
    });
});

describe("matchTickers", () => {
    it("matches cashtag and bare symbol forms case-insensitively", () => {
        expect(matchTickers("Buying $AAPL calls tomorrow", ["AAPL", "TSLA"])).toEqual(["AAPL"]);
        expect(matchTickers("aapl to the moon", ["AAPL"])).toEqual(["AAPL"]);
        expect(matchTickers("TSLA and $AAPL both up", ["AAPL", "TSLA"])).toEqual(["AAPL", "TSLA"]);
    });

    it("does not match a symbol embedded in a longer token", () => {
        expect(matchTickers("AAPLX is a different ticker", ["AAPL"])).toEqual([]);
    });

    it("handles symbols containing regex metacharacters like BRK.B", () => {
        expect(() => matchTickers("BRK.B hits an all-time high", ["BRK.B"])).not.toThrow();
        expect(matchTickers("BRK.B hits an all-time high", ["BRK.B"])).toEqual(["BRK.B"]);
        expect(matchTickers("No berkshire mention here", ["BRK.B"])).toEqual([]);
    });
});

describe("mapEdgarEntry", () => {
    const filingUrl = "https://www.sec.gov/Archives/edgar/data/320193/000032019325000001-index.htm";

    it("extracts the form from the category term and synthesizes the headline", () => {
        const entry: EdgarEntry = {
            title: "8-K - Current report",
            updated: "2025-01-06T12:00:00-05:00",
            link: {"@_href": filingUrl},
            category: {"@_term": "8-K"},
        };

        const article = mapEdgarEntry(entry, "AAPL");

        expect(article).toMatchObject({
            id: hashId(filingUrl),
            headline: "AAPL filed 8-K: 8-K - Current report",
            summary: "8-K - Current report",
            source: "SEC EDGAR",
            url: filingUrl,
            category: "filing",
            related: "AAPL",
        });
    });

    it("parses the updated timestamp into UNIX seconds, respecting the offset", () => {
        const entry: EdgarEntry = {
            title: "8-K - Current report",
            updated: "2025-01-06T12:00:00-05:00",
            link: {"@_href": filingUrl},
            category: {"@_term": "8-K"},
        };

        expect(mapEdgarEntry(entry, "AAPL").datetime).toBe(JAN_6_2025_NOON_UTC + EASTERN_OFFSET_SECONDS);
    });

    it("falls back to the leading title token for the form when category is missing", () => {
        const entry: EdgarEntry = {
            title: "10-Q - Quarterly report",
            updated: "2025-01-06T12:00:00Z",
            link: [{"@_href": filingUrl}, {"@_href": "https://www.sec.gov/other"}],
        };

        const article = mapEdgarEntry(entry, "MSFT");

        expect(article.headline).toBe("MSFT filed 10-Q: 10-Q - Quarterly report");
        // Array-shaped link nodes resolve to the first href.
        expect(article.url).toBe(filingUrl);
        expect(article.datetime).toBe(JAN_6_2025_NOON_UTC);
    });
});

// SEC filings used to contribute only their title — EDGAR publishes no abstract.
// These cover the two things that changed that: the metadata already present in the
// feed, and the filing document text fetched alongside it.
describe("SEC filing enrichment", () => {
    describe("describeFilingItems", () => {
        it("expands 8-K item codes into what actually happened", () => {
            expect(describeFilingItems("items 2.02 and 9.01"))
                .toBe("results of operations and financial condition; financial statements and exhibits");
        });

        it("ignores codes it has no label for rather than emitting bare numbers", () => {
            expect(describeFilingItems("items 2.02 and 99.99")).toBe("results of operations and financial condition");
        });

        it("is empty when the filing has no items (10-Q, 10-K)", () => {
            expect(describeFilingItems(undefined)).toBe("");
            expect(describeFilingItems("")).toBe("");
        });
    });

    describe("describeFiling", () => {
        it("combines form name, item subjects and filing date", () => {
            expect(describeFiling({content: {
                "form-name": "Current report",
                "items-desc": "items 2.02 and 9.01",
                "filing-date": "2026-07-30",
            }})).toBe("Current report — results of operations and financial condition; financial statements and exhibits — filed 2026-07-30");
        });

        it("is empty when the feed carried no content block", () => {
            expect(describeFiling({title: "8-K - Current report"})).toBe("");
        });
    });

    describe("pickFilingDocument", () => {
        // Shape taken from a real EDGAR index.json for an Apple 8-K.
        const files = [
            {name: "0000320193-26-000018-index.html", size: ""},
            {name: "0000320193-26-000018.txt", size: ""},
            {name: "0000320193-26-000018-xbrl.zip", size: 24417},
            {name: "a8-kex991q3202606272026.htm", size: 173484},
            {name: "aapl-20260730.htm", size: 38350},
            {name: "aapl-20260730.xsd", size: 3650},
            {name: "aapl-20260730_lab.xml", size: 34050},
        ];

        it("prefers the exhibit over the inline-XBRL primary document", () => {
            // Measured against the real filing: the primary document opens with
            // hundreds of taxonomy identifiers, the exhibit with the press release.
            expect(pickFilingDocument(files, "0000320193-26-000018")).toBe("a8-kex991q3202606272026.htm");
        });

        it("skips index, header and non-document files", () => {
            const picked = pickFilingDocument(files, "0000320193-26-000018");
            expect(picked).not.toContain("index");
            expect(picked).not.toMatch(/\.(xsd|xml|zip|txt)$/);
        });

        it("falls back to the largest document when there is no exhibit", () => {
            expect(pickFilingDocument([
                {name: "msft-20260630.htm", size: 91000},
                {name: "msft-20260630_lab.xml", size: 120000},
                {name: "small.htm", size: 10},
            ], "")).toBe("msft-20260630.htm");
        });

        it("returns undefined when the directory holds no documents", () => {
            expect(pickFilingDocument([{name: "a.xml", size: 10}], "")).toBeUndefined();
            expect(pickFilingDocument([], "")).toBeUndefined();
        });
    });

    describe("extractFilingText", () => {
        it("skips the leading XBRL identifier block and starts at the prose", () => {
            const html = `<div>aapl-20260730 false 0000320193 2026-07-30
                us-gaap:CommonStockMember aapl:A1.625NotesDue2026Member
                <p>Apple reports third quarter results today.</p></div>`;
            expect(extractFilingText(html)).toBe("Apple reports third quarter results today.");
        });

        it("decodes numeric entities rather than leaking them into the summary", () => {
            expect(extractFilingText("<p>Apple &#174; announced record revenue today &#8212; again</p>"))
                .toContain("Apple ® announced record revenue today — again");
        });

        it("drops script and style content", () => {
            const html = "<script>steal()</script><style>.a{}</style><p>Real prose lives here now</p>";
            const text = extractFilingText(html);
            expect(text).toBe("Real prose lives here now");
        });

        it("survives empty and tagless input", () => {
            expect(extractFilingText("")).toBe("");
            expect(extractFilingText("<p></p>")).toBe("");
        });
    });

    describe("looksInformative", () => {
        it("accepts a press-release opening", () => {
            expect(looksInformative("Apple reports third quarter results with record revenue and earnings per share")).toBe(true);
        });

        it("rejects a wall of XBRL identifiers", () => {
            expect(looksInformative("aapl-20260730 0000320193 us-gaap:CommonStockMember aapl:A1.625NotesDue2026Member 2026-07-30 0000320193")).toBe(false);
        });

        it("rejects text too short to judge", () => {
            expect(looksInformative("8-K")).toBe(false);
            expect(looksInformative("")).toBe(false);
        });
    });

    it("layers document text onto the metadata description", () => {
        const article = mapEdgarEntry(
            {
                title: "8-K - Current report",
                updated: "2025-01-06T12:00:00Z",
                link: {"@_href": "https://www.sec.gov/x-index.htm"},
                category: {"@_term": "8-K"},
                content: {"form-name": "Current report", "items-desc": "items 2.02", "filing-date": "2026-07-30"},
            },
            "AAPL",
            "Apple reports third quarter results.",
        );
        expect(article.summary).toBe(
            "Current report — results of operations and financial condition — filed 2026-07-30 — Apple reports third quarter results.",
        );
    });

    it("still yields a usable summary when both metadata and body are missing", () => {
        const article = mapEdgarEntry(
            {title: "8-K - Current report", updated: "2025-01-06T12:00:00Z", link: {"@_href": "https://x/y-index.htm"}},
            "AAPL",
        );
        expect(article.summary).toBe("8-K - Current report");
    });
});
