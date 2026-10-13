// arXiv's Atom API: the query addresses the job asks for and the reading of what comes back.
// Only the parser runs in a test; the fetch is the job's (lib/lab/papers/job.ts). Everything an
// entry carries is read as data and bounded; no link from the feed is kept.

import {XMLParser} from "fast-xml-parser";
import {ABSTRACT_STORED_MAX, AUTHORS_MAX, TITLE_MAX} from "@/lib/lab/papers/config";
import {arxivIdOf} from "@/lib/lab/papers/links";

export type ArxivEntry = {
    id: string;
    title: string;
    abstract: string;
    authors: string[];
    categories: string[];
    primary: string;
    published: string;   // ISO instant of version 1
    updated: string;
};

export type ArxivListing =
    | {status: 'ok'; entries: ArxivEntry[]; total: number | null}
    | {status: 'error'; message: string};

const ARXIV_API = 'https://export.arxiv.org/api/query';

// One request per track: the categories OR'd, newest submissions first.
export const arxivListingUrl = (categories: readonly string[], max: number): string =>
    `${ARXIV_API}?search_query=${categories.map((c) => `cat:${c}`).join('+OR+')}&sortBy=submittedDate&sortOrder=descending&max_results=${max}`;

// The metadata of known ids, for the papers another feed named.
export const arxivIdListUrl = (ids: readonly string[]): string =>
    `${ARXIV_API}?id_list=${ids.join(',')}&max_results=${ids.length}`;

// fast-xml-parser emits one object for a single child and an array for many; these are always
// read as arrays. Tag values stay strings (an id such as 2610.13947 is not a number).
const ARRAYS = new Set(['feed.entry', 'feed.entry.author', 'feed.entry.category', 'feed.entry.link']);
const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseTagValue: false,
    trimValues: true,
    isArray: (_name, jpath) => ARRAYS.has(String(jpath)),
});

type Loose = Record<string, unknown>;

const text = (value: unknown, max = Number.POSITIVE_INFINITY): string => {
    if (typeof value === 'string') return value.replace(/\s+/g, ' ').trim().slice(0, max);
    if (value && typeof value === 'object' && '#text' in (value as Loose)) return text((value as Loose)['#text'], max);
    return '';
};

const attr = (value: unknown, name: string): string =>
    value && typeof value === 'object' ? text((value as Loose)[`@_${name}`]) : '';

const list = (value: unknown): Loose[] => (Array.isArray(value) ? value.filter((v) => v && typeof v === 'object') as Loose[] : []);

export const parseArxivAtom = (xml: string): ArxivListing => {
    let doc: unknown;
    try {
        doc = parser.parse(String(xml ?? ''));
    } catch {
        return {status: 'error', message: 'not an Atom feed'};
    }
    const feed = (doc as Loose | null)?.feed;
    if (!feed || typeof feed !== 'object') return {status: 'error', message: 'no feed element'};
    const entries: ArxivEntry[] = [];
    for (const entry of list((feed as Loose).entry)) {
        const idUrl = text(entry.id);
        // arXiv answers a bad query with one entry whose id is an error address.
        if (idUrl.includes('/api/errors')) return {status: 'error', message: text(entry.summary, 200) || text(entry.title, 200) || 'arXiv error'};
        const id = arxivIdOf(idUrl);
        const title = text(entry.title, TITLE_MAX);
        if (!id || !title) continue;
        const categories = list(entry.category).map((c) => attr(c, 'term')).filter(Boolean);
        const primary = attr(entry['arxiv:primary_category'], 'term') || categories[0] || '';
        entries.push({
            id,
            title,
            abstract: text(entry.summary, ABSTRACT_STORED_MAX),
            authors: list(entry.author).map((a) => text(a.name, 80)).filter(Boolean).slice(0, AUTHORS_MAX),
            categories,
            primary,
            published: text(entry.published, 40),
            updated: text(entry.updated, 40),
        });
    }
    const totalText = text((feed as Loose)['opensearch:totalResults']);
    const total = totalText ? Number(totalText) : Number.NaN;
    return {status: 'ok', entries, total: Number.isFinite(total) ? total : null};
};
