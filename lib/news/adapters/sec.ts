// SEC EDGAR adapter — pulls recent filings per symbol from the browse-edgar Atom feed.
// DB-free by design: pure mapping + fetch only, so it stays testable and cache-friendly.

import {XMLParser} from "fast-xml-parser";
import {
    FEED_REVALIDATE_SECONDS,
    SEC_FORM_TYPES,
    SEC_LOOKBACK_DAYS,
    SEC_MAX_SYMBOLS,
    hashId,
    secUserAgent,
} from "@/lib/news/config";
import {formatArticle, validateArticle} from "@/lib/utils";

// Shape of one <entry> from EDGAR's browse Atom feed when parsed with ignoreAttributes: false.
export type EdgarEntry = {
    title?: string;
    updated?: string;
    link?: {"@_href"?: string} | Array<{"@_href"?: string}>;
    category?: {"@_term"?: string};
};

type EdgarFeed = {feed?: {entry?: EdgarEntry | EdgarEntry[]}};

const SEC_SOURCE_NAME = "SEC EDGAR";
const SEC_FILING_CATEGORY = "filing";
// EDGAR paginates server-side; ten entries per symbol is plenty inside a 7-day lookback.
const SEC_ENTRIES_PER_SYMBOL = 10;
const MILLISECONDS_PER_SECOND = 1000;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * MILLISECONDS_PER_SECOND;

// EDGAR titles look like '8-K - Current report' — the form code is the leading token.
// The Atom <category term> is authoritative when present; the title token is the fallback.
const entryForm = (entry: EdgarEntry): string =>
    entry.category?.["@_term"] || entry.title?.trim().split(/\s+/)[0] || "";

const firstLinkHref = (link: EdgarEntry["link"]): string | undefined =>
    Array.isArray(link) ? link[0]?.["@_href"] : link?.["@_href"];

const edgarBrowseUrl = (symbol: string): string =>
    "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany" +
    `&CIK=${encodeURIComponent(symbol.toUpperCase())}` +
    `&type=&dateb=&owner=include&count=${SEC_ENTRIES_PER_SYMBOL}&output=atom`;

export const mapEdgarEntry = (entry: EdgarEntry, symbol: string): RawNewsArticle => {
    const title = entry.title?.trim() ?? "";
    const form = entryForm(entry);
    const url = firstLinkHref(entry.link);
    const datetime = entry.updated
        ? Math.floor(Date.parse(entry.updated) / MILLISECONDS_PER_SECOND)
        : undefined;

    return {
        // Filing detail URLs are unique per accession, so they make stable ids; fall back
        // to symbol+timestamp when EDGAR omits the link.
        id: hashId(url || symbol + (entry.updated ?? "")),
        headline: title ? `${symbol} filed ${form}: ${title}` : undefined,
        // EDGAR gives no abstract, so the title doubles as summary — must be non-empty
        // or validateArticle drops the item.
        summary: title || undefined,
        source: SEC_SOURCE_NAME,
        url,
        datetime,
        category: SEC_FILING_CATEGORY,
        related: symbol,
    };
};

export const fetchSecFilings = async (symbols: string[]): Promise<MarketNewsArticle[]> => {
    const parser = new XMLParser({ignoreAttributes: false});
    const cutoffMs = Date.now() - SEC_LOOKBACK_DAYS * MILLISECONDS_PER_DAY;
    const articles: MarketNewsArticle[] = [];
    // Distinct index per formatted article keeps formatArticle ids unique across symbols.
    let articleIndex = 0;

    // Sequential on purpose — SEC fair-access policy frowns on parallel hammering.
    for (const symbol of symbols.slice(0, SEC_MAX_SYMBOLS)) {
        try {
            const response = await fetch(edgarBrowseUrl(symbol), {
                headers: {"User-Agent": secUserAgent()},
                next: {revalidate: FEED_REVALIDATE_SECONDS},
            });
            if (!response.ok) {
                throw new Error(`EDGAR responded ${response.status} for ${symbol}`);
            }

            const parsed = parser.parse(await response.text()) as EdgarFeed;
            const rawEntries = parsed.feed?.entry;
            const entries = Array.isArray(rawEntries) ? rawEntries : rawEntries ? [rawEntries] : [];

            entries
                .filter((entry) => {
                    const updatedMs = entry.updated ? Date.parse(entry.updated) : Number.NaN;
                    return SEC_FORM_TYPES.includes(entryForm(entry)) && updatedMs >= cutoffMs;
                })
                .map((entry) => mapEdgarEntry(entry, symbol))
                .filter(validateArticle)
                .forEach((raw) => {
                    articles.push({...formatArticle(raw, true, symbol, articleIndex), sourceType: "sec"});
                    articleIndex++;
                });
        } catch (error) {
            // Unresolvable tickers (EDGAR knows CIKs, not every symbol) or transient
            // failures should not sink the whole digest — log and move on.
            console.error(`Failed to fetch SEC filings for ${symbol}:`, error);
        }
    }

    return articles.sort((a, b) => b.datetime - a.datetime);
};
