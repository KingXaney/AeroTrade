// The step bodies of the weekday papers job (lib/jobs/functions/lab.ts): the feeds fetched with
// a timeout and the site's user agent, read by the pure parsers. Each returns plain data for
// Inngest to memoise; a feed that fails returns its error, never throws, so one source down
// still leaves a day.

import {LAB_TRACKS, type LabTrack} from "@/lib/learn/copy/lab/types";
import {reportLimit, responseSignal} from "@/lib/limits/report";
import {ARXIV_ID_BATCH, ARXIV_LISTING_SIZE, FETCH_TIMEOUT_MS, LISTING_CATEGORIES, PAPERS_USER_AGENT, SEEN_WINDOW_DAYS} from "@/lib/lab/papers/config";
import {arxivIdListUrl, arxivListingUrl, parseArxivAtom, type ArxivListing} from "@/lib/lab/papers/arxiv";
import {hfDailyPapersUrl, hfDatesFor, parseHfDailyPapers, type HfPaper} from "@/lib/lab/papers/hf";
import {readSeenIds} from "@/lib/lab/papers/store";

const init = (): RequestInit => ({headers: {'User-Agent': PAPERS_USER_AGENT}, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: 'no-store'});

export const loadSeenIds = (today: string): Promise<string[]> => readSeenIds(today, SEEN_WINDOW_DAYS);

const fetchArxiv = async (url: string): Promise<ArxivListing> => {
    try {
        const response = await fetch(url, init());
        if (!response.ok) {
            await reportLimit('arxiv', await responseSignal(response, 'listing'));
            return {status: 'error', message: `HTTP ${response.status}`};
        }
        return parseArxivAtom(await response.text());
    } catch (error) {
        return {status: 'error', message: error instanceof Error ? error.message : String(error)};
    }
};

export const fetchTrackListing = (track: LabTrack): Promise<ArxivListing> =>
    fetchArxiv(arxivListingUrl(LISTING_CATEGORIES[track], ARXIV_LISTING_SIZE));

export const fetchArxivMetadata = (ids: readonly string[]): Promise<ArxivListing> =>
    ids.length === 0 ? Promise.resolve({status: 'ok', entries: [], total: 0}) : fetchArxiv(arxivIdListUrl(ids.slice(0, ARXIV_ID_BATCH)));

// Both days' lists, merged by id with the higher upvote count kept; a day that fails is skipped.
export const fetchHfDays = async (today: string): Promise<{papers: HfPaper[]; errors: string[]}> => {
    const byId = new Map<string, HfPaper>();
    const errors: string[] = [];
    for (const date of hfDatesFor(today)) {
        try {
            const response = await fetch(hfDailyPapersUrl(date), init());
            if (!response.ok) {
                errors.push(`${date}: HTTP ${response.status}`);
                await reportLimit('huggingface', await responseSignal(response, `daily papers ${date}`));
                continue;
            }
            for (const paper of parseHfDailyPapers(await response.json())) {
                const seen = byId.get(paper.id);
                if (!seen || seen.upvotes < paper.upvotes) byId.set(paper.id, paper);
            }
        } catch (error) {
            errors.push(`${date}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    return {papers: [...byId.values()], errors};
};

export const TRACKS_IN_ORDER: readonly LabTrack[] = LAB_TRACKS;
