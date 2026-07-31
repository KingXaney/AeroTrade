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
import {formatArticle, FULL_SUMMARY_MAX_CHARS, validateArticle} from "@/lib/utils";

// Shape of one <entry> from EDGAR's browse Atom feed when parsed with ignoreAttributes: false.
// The <content> block carries structured filing metadata that is far more informative
// than the title — notably items-desc, which names what an 8-K is actually about.
export type EdgarContent = {
    "accession-number"?: string;
    "filing-date"?: string;
    "filing-href"?: string;
    "filing-type"?: string;
    "form-name"?: string;
    "items-desc"?: string;
};

export type EdgarEntry = {
    title?: string;
    updated?: string;
    link?: {"@_href"?: string} | Array<{"@_href"?: string}>;
    category?: {"@_term"?: string};
    content?: EdgarContent;
};

type EdgarFeed = {feed?: {entry?: EdgarEntry | EdgarEntry[]}};

const SEC_SOURCE_NAME = "SEC EDGAR";
const SEC_FILING_CATEGORY = "filing";
// EDGAR paginates server-side; ten entries per symbol is plenty inside a 7-day lookback.
const SEC_ENTRIES_PER_SYMBOL = 10;
// Body retrieval costs two extra sequential requests per filing, and the aggregator
// caps SEC articles well below what ten symbols can return — so bound the spend and
// let the rest fall back to metadata-only, which is still richer than the old title.
const SEC_BODY_FETCH_BUDGET = 12;
// These fetches sit inside one Inngest step alongside the feed requests. Without a
// deadline a single stalled sec.gov connection hangs the whole brain update; with
// one it degrades to '' , which every caller already handles.
const SEC_FETCH_TIMEOUT_MS = 15_000;
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

// An 8-K's item codes are SEC's own taxonomy for "what happened". The bare code is
// meaningless downstream, so the label travels with it.
const SEC_ITEM_LABELS: Record<string, string> = {
    "1.01": "entry into a material agreement",
    "1.02": "termination of a material agreement",
    "2.01": "completion of an acquisition or disposition",
    "2.02": "results of operations and financial condition",
    "2.03": "creation of a direct financial obligation",
    "2.05": "costs associated with exit or disposal activities",
    "3.01": "delisting or listing-standard non-compliance",
    "4.01": "change in certifying accountant",
    "4.02": "non-reliance on previously issued financials",
    "5.01": "change in control",
    "5.02": "director or officer changes",
    "5.07": "submission of matters to a shareholder vote",
    "7.01": "regulation FD disclosure",
    "8.01": "other events",
    "9.01": "financial statements and exhibits",
};

const ITEM_CODE_PATTERN = /\d+\.\d+/g;

export const describeFilingItems = (itemsDesc: string | undefined): string => {
    const codes = String(itemsDesc ?? "").match(ITEM_CODE_PATTERN) ?? [];
    const labels = codes.map((code) => SEC_ITEM_LABELS[code]).filter(Boolean);
    return labels.join("; ");
};

// Always-available description built purely from the feed — no extra request. This
// alone is a large improvement on using the bare filing title as the summary.
export const describeFiling = (entry: EdgarEntry): string => {
    const content = entry.content;
    if (!content) return "";
    const items = describeFilingItems(content["items-desc"]);
    return [
        content["form-name"],
        items,
        content["filing-date"] ? `filed ${content["filing-date"]}` : "",
    ].filter(Boolean).join(" — ");
};

export const mapEdgarEntry = (entry: EdgarEntry, symbol: string, body = ""): RawNewsArticle => {
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
        // EDGAR gives no abstract. The feed's own metadata (form name, 8-K item
        // subjects, filing date) always applies; the filing's document text is layered
        // on when it could be fetched and read as prose. Falls back to the title so
        // validateArticle never drops the item.
        summary: [describeFiling(entry), body].filter(Boolean).join(" — ") || title || undefined,
        source: SEC_SOURCE_NAME,
        url,
        datetime,
        category: SEC_FILING_CATEGORY,
        related: symbol,
    };
};

// --- Filing document text ----------------------------------------------------

export type EdgarDirectoryFile = {name?: string; size?: number | string};

// The filing-href points at the human index page; its sibling index.json lists the
// directory, which is far more robust to parse than the HTML.
export const filingDirectoryUrl = (filingHref: string): string =>
    filingHref.replace(/\/[^/]*$/, "/index.json");

// Exhibits are where the prose lives. A modern filing's *primary* document is inline
// XBRL and opens with hundreds of taxonomy identifiers (us-gaap:CommonStockMember,
// aapl:A1.625NotesDue2026Member) — measured against real filings, its first 400
// characters carry less information than the title we already had.
// "ex" followed by digits appears mid-name in real exhibits (a8-kex991q3…htm), so it
// cannot be anchored to a word boundary. It also appears in the PRIMARY document of
// issuers whose ticker ends in "ex" (flex-20260630.htm), which would invert the
// heuristic for them — those are excluded by name shape instead: EDGAR names the
// primary inline-XBRL document {prefix}-{YYYYMMDD}.htm.
const EXHIBIT_NAME_PATTERN = /ex[-_]?\d/i;
const PRIMARY_DOCUMENT_PATTERN = /^[a-z0-9]+-\d{8}\.html?$/i;
// Sarbanes-Oxley certifications (31/32) and auditor consents (23/24) are pure
// boilerplate. On a 10-Q or 10-K they are usually the only exhibits, so without this
// they beat the quarterly report itself — and they read as prose, so looksInformative
// cannot catch them either.
const BOILERPLATE_EXHIBIT_PATTERN = /(^|[^a-z])ex[-_]?(2[34]|3[12])/i;
const DOCUMENT_NAME_PATTERN = /\.html?$/i;

export const pickFilingDocument = (
    files: EdgarDirectoryFile[],
    accessionNumber = "",
): string | undefined => {
    const candidates = files
        .map((file) => ({name: String(file.name ?? ""), size: Number(file.size ?? 0)}))
        .filter((file) => DOCUMENT_NAME_PATTERN.test(file.name))
        // Index and header pages describe the filing rather than containing it.
        .filter((file) => !accessionNumber || !file.name.includes(accessionNumber));
    if (candidates.length === 0) return undefined;

    const largestFirst = (a: {size: number}, b: {size: number}) => b.size - a.size;
    const exhibits = candidates.filter((file) =>
        EXHIBIT_NAME_PATTERN.test(file.name)
        && !PRIMARY_DOCUMENT_PATTERN.test(file.name)
        && !BOILERPLATE_EXHIBIT_PATTERN.test(file.name));
    const ranked = exhibits.length > 0 ? exhibits : candidates;
    return [...ranked].sort(largestFirst)[0].name;
};

const NAMED_ENTITIES: [RegExp, string][] = [
    [/&nbsp;?/gi, " "],
    [/&quot;/gi, '"'],
    [/&apos;/gi, "'"],
    [/&lt;/gi, "<"],
    [/&gt;/gi, ">"],
    [/&amp;/gi, "&"],
];

// Filings are littered with numeric entities (&#174; for ®, &#8212; for an em dash).
// Decoding them generically beats maintaining a list that is always one symbol short.
const NUMERIC_ENTITY = /&#(x[0-9a-f]+|\d+);?/gi;
const MAX_CODE_POINT = 0x10ffff;
const SURROGATE_START = 0xd800;
const SURROGATE_END = 0xdfff;

const decodeEntities = (input: string): string => {
    let text = input.replace(NUMERIC_ENTITY, (_match, code: string) => {
        const point = code.toLowerCase().startsWith("x")
            ? Number.parseInt(code.slice(1), 16)
            : Number.parseInt(code, 10);
        // Filing HTML is issuer-supplied, so a malformed entity like &#1114112; is
        // reachable. fromCodePoint throws RangeError above the Unicode maximum or in
        // the surrogate range, and that throw would discard the whole filing body
        // after both fetches had already been spent.
        const usable = Number.isFinite(point)
            && point > 0
            && point <= MAX_CODE_POINT
            && !(point >= SURROGATE_START && point <= SURROGATE_END);
        return usable ? String.fromCodePoint(point) : " ";
    });
    for (const [pattern, replacement] of NAMED_ENTITIES) {
        text = text.replace(pattern, replacement);
    }
    return text;
};

// A token is prose if it reads like a word. XBRL identifiers, accession numbers and
// bare dates all fail this, which is how the leading machine block gets skipped.
const PROSE_WORD = /^[A-Za-z][A-Za-z'’-]+$/;
const PROSE_RUN_LENGTH = 4;
const PROSE_LEAD_TOLERANCE = 2;
const PROSE_SAMPLE_TOKENS = 60;
const MIN_PROSE_RATIO = 0.5;

export const extractFilingText = (html: string): string => {
    const text = decodeEntities(
        String(html ?? "")
            .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
            .replace(/<[^>]+>/g, " "),
    );
    const tokens = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);

    // Skip the leading machine-readable block: start at the first run of consecutive
    // real words, so the reader gets the press release rather than the taxonomy.
    let firstProse = 0;
    for (let i = 0; i < tokens.length; i++) {
        let run = 0;
        while (run < PROSE_RUN_LENGTH && PROSE_WORD.test(tokens[i + run] ?? "")) run++;
        if (run >= PROSE_RUN_LENGTH) {
            firstProse = i;
            break;
        }
    }
    // Prose starting almost immediately means there was no machine block — the few
    // leading tokens are part of the sentence (a company name, then a ® symbol).
    return tokens.slice(firstProse <= PROSE_LEAD_TOLERANCE ? 0 : firstProse).join(" ");
};

// Guards against storing a wall of boilerplate: if the opening doesn't read like
// English, the feed metadata alone is the better summary.
export const looksInformative = (text: string): boolean => {
    const tokens = text.trim().split(/\s+/).filter(Boolean).slice(0, PROSE_SAMPLE_TOKENS);
    if (tokens.length < PROSE_RUN_LENGTH) return false;
    const words = tokens.filter((token) => PROSE_WORD.test(token)).length;
    return words / tokens.length >= MIN_PROSE_RATIO;
};

// Two extra sequential requests per filing (directory, then document), same
// fair-access politeness as the feed fetch. Any failure returns '' so the caller
// degrades to metadata-only rather than losing the article.
const fetchFilingBody = async (content: EdgarContent | undefined): Promise<string> => {
    const filingHref = content?.["filing-href"];
    if (!filingHref) return "";
    try {
        const init = {headers: {"User-Agent": secUserAgent()}, signal: AbortSignal.timeout(SEC_FETCH_TIMEOUT_MS)};
        const dirResponse = await fetch(filingDirectoryUrl(filingHref), init);
        if (!dirResponse.ok) return "";
        const directory = await dirResponse.json() as {directory?: {item?: EdgarDirectoryFile[]}};
        const name = pickFilingDocument(directory.directory?.item ?? [], content?.["accession-number"] ?? "");
        if (!name) return "";

        const docResponse = await fetch(filingHref.replace(/\/[^/]*$/, `/${name}`), init);
        if (!docResponse.ok) return "";
        const text = extractFilingText(await docResponse.text());
        return looksInformative(text) ? text.slice(0, FULL_SUMMARY_MAX_CHARS) : "";
    } catch (error) {
        console.error(`Failed to fetch SEC filing body for ${filingHref}:`, error);
        return "";
    }
};

export const fetchSecFilings = async (symbols: string[]): Promise<MarketNewsArticle[]> => {
    const parser = new XMLParser({ignoreAttributes: false});
    const cutoffMs = Date.now() - SEC_LOOKBACK_DAYS * MILLISECONDS_PER_DAY;
    const articles: MarketNewsArticle[] = [];
    // Distinct index per formatted article keeps formatArticle ids unique across symbols.
    let articleIndex = 0;
    let bodyBudget = SEC_BODY_FETCH_BUDGET;

    // Sequential on purpose — SEC fair-access policy frowns on parallel hammering.
    for (const symbol of symbols.slice(0, SEC_MAX_SYMBOLS)) {
        try {
            const response = await fetch(edgarBrowseUrl(symbol), {
                headers: {"User-Agent": secUserAgent()},
                next: {revalidate: FEED_REVALIDATE_SECONDS},
                signal: AbortSignal.timeout(SEC_FETCH_TIMEOUT_MS),
            });
            if (!response.ok) {
                throw new Error(`EDGAR responded ${response.status} for ${symbol}`);
            }

            const parsed = parser.parse(await response.text()) as EdgarFeed;
            const rawEntries = parsed.feed?.entry;
            const entries = Array.isArray(rawEntries) ? rawEntries : rawEntries ? [rawEntries] : [];

            const recent = entries.filter((entry) => {
                const updatedMs = entry.updated ? Date.parse(entry.updated) : Number.NaN;
                return SEC_FORM_TYPES.includes(entryForm(entry)) && updatedMs >= cutoffMs;
            });

            // Sequential again, for the same fair-access reason as the feed loop.
            for (const entry of recent) {
                // EDGAR returns newest first, so the budget is spent on recent filings.
                const body = bodyBudget > 0 ? await fetchFilingBody(entry.content) : "";
                if (bodyBudget > 0) bodyBudget--;
                const raw = mapEdgarEntry(entry, symbol, body);
                if (!validateArticle(raw)) continue;
                articles.push({...formatArticle(raw, true, symbol, articleIndex), sourceType: "sec"});
                articleIndex++;
            }
        } catch (error) {
            // Unresolvable tickers (EDGAR knows CIKs, not every symbol) or transient
            // failures should not sink the whole digest — log and move on.
            console.error(`Failed to fetch SEC filings for ${symbol}:`, error);
        }
    }

    return articles.sort((a, b) => b.datetime - a.datetime);
};
