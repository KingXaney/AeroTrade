// A day of papers, assembled from the feeds: arXiv's listings carry the categories, Hugging
// Face's daily list the upvotes, and the two are merged by id. A paper is kept when it is new
// (not stored in the last week, published within a week) and among the day's top twelve of its
// track — upvotes first, then recency. A stored day holds no URL: links are built from the id
// (lib/lab/papers/links.ts) at render time. Pure.

import type {LabTrack} from "@/lib/learn/copy/lab/types";
import {LAB_TRACKS} from "@/lib/learn/copy/lab/types";
import {NOVELTY_DAYS, PAPERS_PER_TRACK, TRACK_CATEGORIES} from "@/lib/lab/papers/config";
import type {ArxivEntry} from "@/lib/lab/papers/arxiv";
import type {HfPaper} from "@/lib/lab/papers/hf";
import {addCalendarDays} from "@/lib/dates";

export type PaperSource = 'arxiv' | 'hf' | 'both';

export type LabPaper = {
    id: string;
    title: string;
    abstract: string;
    authors: string[];
    categories: string[];
    primary: string;
    track: LabTrack;
    published: string;   // ISO instant; '' when the feed gave none
    source: PaperSource;
    upvotes: number | null;
};

export type LabDayCounts = {listed: number; hf: number; novel: number; kept: number};

export type LabDayRecord = {day: string; papers: LabPaper[]; counts: LabDayCounts};

// A digest bullet cites papers by 0-based index into the day's list, in the order shown to the
// model; the order is the stored order, so an index is stable.
export type LabDigestBullet = {text: string; papers: number[]};
export type LabDigest = {headline: string; bullets: LabDigestBullet[]};
export type LabDayDigest = LabDigest & {model: string; writtenAt: string};

export type LabDayStored = LabDayRecord & {digest: LabDayDigest | null; fetchedAt: string};

// The track a paper belongs to: by its primary category first, then any category; null for a
// paper outside the three fields.
export const trackFor = (primary: string, categories: readonly string[]): LabTrack | null => {
    for (const track of LAB_TRACKS) {
        if (TRACK_CATEGORIES[track].includes(primary)) return track;
    }
    for (const track of LAB_TRACKS) {
        if (categories.some((c) => TRACK_CATEGORIES[track].includes(c))) return track;
    }
    return null;
};

// Whether an instant falls within the last `days` calendar days of `today` (ET day strings);
// an unreadable instant does not.
export const withinDays = (published: string, today: string, days: number): boolean => {
    const day = String(published ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
    return day >= addCalendarDays(today, -days) && day <= addCalendarDays(today, 1);
};

type MergeInput = {arxiv: readonly ArxivEntry[]; hf: readonly HfPaper[]; metadata: readonly ArxivEntry[]};

// The feeds as one list: every arXiv entry (the listings and the id lookups) placed in its
// track, then each Hugging Face paper joined by id with its upvotes — or, with no arXiv
// metadata for it, placed in machine learning, where that list almost always belongs.
export const mergePapers = ({arxiv, hf, metadata}: MergeInput): LabPaper[] => {
    const byId = new Map<string, LabPaper>();
    for (const entry of [...arxiv, ...metadata]) {
        if (byId.has(entry.id)) continue;
        const track = trackFor(entry.primary, entry.categories);
        if (!track) continue;
        byId.set(entry.id, {
            id: entry.id, title: entry.title, abstract: entry.abstract, authors: [...entry.authors],
            categories: [...entry.categories], primary: entry.primary, track, published: entry.published,
            source: 'arxiv', upvotes: null,
        });
    }
    for (const paper of hf) {
        const known = byId.get(paper.id);
        if (known) {
            known.source = 'both';
            known.upvotes = paper.upvotes;
            if (!known.abstract && paper.abstract) known.abstract = paper.abstract;
            continue;
        }
        byId.set(paper.id, {
            id: paper.id, title: paper.title, abstract: paper.abstract, authors: [...paper.authors],
            categories: [], primary: '', track: 'ml', published: paper.published, source: 'hf', upvotes: paper.upvotes,
        });
    }
    return [...byId.values()];
};

export const isNovel = (paper: Pick<LabPaper, 'id' | 'published'>, seenIds: ReadonlySet<string>, today: string): boolean =>
    !seenIds.has(paper.id) && withinDays(paper.published, today, NOVELTY_DAYS);

// Upvotes first (a paper nobody voted on after one somebody did), then the newest, then the
// id, so one input is one order.
export const rankTrack = (papers: readonly LabPaper[]): LabPaper[] =>
    [...papers].sort((a, b) =>
        ((b.upvotes ?? -1) - (a.upvotes ?? -1))
        || (b.published > a.published ? 1 : b.published < a.published ? -1 : 0)
        || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

type AssembleInput = MergeInput & {today: string; seenIds: ReadonlySet<string>};

// The day's record: the new papers of each track, ranked and capped, in track order — the
// order the digest's prompt and the page both use.
export const assembleDay = ({today, arxiv, hf, metadata, seenIds}: AssembleInput): LabDayRecord => {
    const merged = mergePapers({arxiv, hf, metadata});
    const novel = merged.filter((paper) => isNovel(paper, seenIds, today));
    const papers = LAB_TRACKS.flatMap((track) => rankTrack(novel.filter((p) => p.track === track)).slice(0, PAPERS_PER_TRACK));
    return {day: today, papers, counts: {listed: arxiv.length + metadata.length, hf: hf.length, novel: novel.length, kept: papers.length}};
};
