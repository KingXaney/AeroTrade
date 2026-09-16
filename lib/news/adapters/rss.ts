import {XMLParser} from "fast-xml-parser";
import {FEED_REVALIDATE_SECONDS, MAX_SYMBOL_FEEDS, RSS_FEEDS, hashId, yahooSymbolFeed, type NewsFeed} from "@/lib/news/config";
import {formatArticle, validateArticle} from "@/lib/utils";

// Next's fetch accepts a `next` key that plain RequestInit doesn't know about.
type NextFetchInit = RequestInit & {next?: {revalidate: number}};

// Plain generic UA — some feed hosts reject requests with no User-Agent at all.
const GENERIC_USER_AGENT = "AeroTrade/1.0";

// RawNewsArticle.datetime is UNIX seconds; Date.parse returns milliseconds.
const MS_PER_SECOND = 1000;

type XmlNode = Record<string, unknown>;

const isRecord = (value: unknown): value is XmlNode =>
    typeof value === "object" && value !== null && !Array.isArray(value);

// fast-xml-parser emits a single object for one child and an array for many — normalize both shapes.
const asArray = (value: unknown): unknown[] => {
    if (value === undefined || value === null) {
        return [];
    }
    return Array.isArray(value) ? value : [value];
};

// CDATA and plain text arrive as strings; attributed/mixed content nests the text under '#text'.
const textOf = (value: unknown): string => {
    if (typeof value === "string") {
        return value;
    }
    if (typeof value === "number") {
        return String(value);
    }
    if (isRecord(value)) {
        return textOf(value["#text"]);
    }
    return "";
};

const stripHtml = (value: string): string =>
    value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

// RSS links are plain text; Atom links are one or many objects carrying the URL in an href attribute.
const linkOf = (value: unknown): string => {
    for (const entry of asArray(value)) {
        if (typeof entry === "string" && entry.trim()) {
            return entry.trim();
        }
        if (isRecord(entry)) {
            const href = entry["@_href"];
            if (typeof href === "string" && href.trim()) {
                return href.trim();
            }
            const text = textOf(entry).trim();
            if (text) {
                return text;
            }
        }
    }
    return "";
};

export const parseRssXml = (xml: string, sourceName: string): RawNewsArticle[] => {
    let parsed: unknown;
    try {
        parsed = new XMLParser({ignoreAttributes: false}).parse(xml);
    } catch {
        // Malformed XML from a feed yields no articles rather than an exception for the caller.
        return [];
    }

    const root = isRecord(parsed) ? parsed : {};
    const rss = root["rss"];
    const feed = root["feed"];

    let items: unknown[] = [];
    if (isRecord(rss)) {
        // RSS 2.0: rss.channel.item[] — a channel is a single object per spec, but stay defensive.
        const channel = asArray(rss["channel"]).find(isRecord);
        items = channel ? asArray(channel["item"]) : [];
    } else if (isRecord(feed)) {
        // Atom: feed.entry[]
        items = asArray(feed["entry"]);
    }

    const articles: RawNewsArticle[] = [];
    for (const raw of items) {
        if (!isRecord(raw)) {
            continue;
        }

        const headline = stripHtml(textOf(raw["title"]));
        const body = stripHtml(
            textOf(raw["description"]) ||
            textOf(raw["summary"]) ||
            textOf(raw["content"]) ||
            textOf(raw["content:encoded"])
        );
        const url = linkOf(raw["link"]);
        if (!url) {
            // hashId keys off the url, and validateArticle would drop a url-less item anyway.
            continue;
        }

        const dateText = textOf(raw["pubDate"]) || textOf(raw["published"]) || textOf(raw["updated"]);
        const parsedMs = Date.parse(dateText);
        if (Number.isNaN(parsedMs)) {
            continue;
        }

        // Aggregators (Google News) name the originating outlet in <source>; carry it
        // separately so callers can prefer it over the feed name without re-parsing.
        const sourceTitle = stripHtml(textOf(raw["source"]));

        articles.push({
            id: hashId(url),
            headline,
            // Fall back to the headline so a description-less item still passes validateArticle.
            summary: body || headline,
            source: sourceName,
            url,
            datetime: Math.round(parsedMs / MS_PER_SECOND),
            category: "general",
            ...(sourceTitle ? {sourceTitle} : {}),
        });
    }
    return articles;
};

export const fetchRssNews = async (symbols?: string[]): Promise<MarketNewsArticle[]> => {
    const targets: {feed: NewsFeed; symbol?: string}[] = RSS_FEEDS.map((feed) => ({feed}));
    for (const symbol of (symbols ?? []).slice(0, MAX_SYMBOL_FEEDS)) {
        targets.push({feed: yahooSymbolFeed(symbol), symbol: symbol.toUpperCase()});
    }

    const perFeed = await Promise.all(
        targets.map(async ({feed, symbol}): Promise<MarketNewsArticle[]> => {
            // Per-feed try/catch — one broken feed must not sink the whole digest.
            try {
                const init: NextFetchInit = {
                    headers: {"User-Agent": GENERIC_USER_AGENT},
                    next: {revalidate: FEED_REVALIDATE_SECONDS},
                };
                const res = await fetch(feed.url, init);
                if (!res.ok) {
                    console.error(`RSS feed "${feed.name}" responded ${res.status}`);
                    return [];
                }
                const xml = await res.text();
                const isSymbolFeed = symbol !== undefined;
                return parseRssXml(xml, feed.name)
                    .filter((article) => validateArticle(article))
                    .map((article, index) => ({
                        ...formatArticle(article, isSymbolFeed, symbol, index),
                        sourceType: "rss" as const,
                    }));
            } catch (error) {
                console.error(`RSS feed "${feed.name}" failed`, error);
                return [];
            }
        })
    );

    return perFeed.flat().sort((a, b) => b.datetime - a.datetime);
};
