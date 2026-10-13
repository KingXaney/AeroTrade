// What the lab's Papers view shows of a stored day: the papers by track with their links built
// from the id, the authors cut to a few, and the digest with each citation resolved to the
// paper it names. Pure.

import type {LabTrack} from "@/lib/learn/copy/lab/types";
import {LAB_TRACKS} from "@/lib/learn/copy/lab/types";
import {AUTHORS_SHOWN} from "@/lib/lab/papers/config";
import type {LabDayCounts, LabDayStored, LabPaper, PaperSource} from "@/lib/lab/papers/day";
import {paperLinks} from "@/lib/lab/papers/links";

export type LabPaperView = {
    id: string;
    n: number;                 // its number in the day's list, the one the digest cites
    title: string;
    authors: string[];
    moreAuthors: number;
    primary: string;
    track: LabTrack;
    upvotes: number | null;
    abstract: string;
    source: PaperSource;
    links: {abs: string; hf: string | null};
};

export type LabDigestRef = {n: number; id: string; title: string};
export type LabDigestView = {headline: string; bullets: {text: string; refs: LabDigestRef[]}[]; model: string};

export type LabPapersView = {
    day: string;
    stale: boolean;
    counts: LabDayCounts;
    tracks: {track: LabTrack; papers: LabPaperView[]}[];
    digest: LabDigestView | null;
};

const toView = (paper: LabPaper, index: number): LabPaperView => {
    const links = paperLinks(paper.id);
    return {
        id: paper.id,
        n: index + 1,
        title: paper.title,
        authors: paper.authors.slice(0, AUTHORS_SHOWN),
        moreAuthors: Math.max(0, paper.authors.length - AUTHORS_SHOWN),
        primary: paper.primary,
        track: paper.track,
        upvotes: paper.upvotes,
        abstract: paper.abstract,
        source: paper.source,
        links: {abs: links.abs, hf: paper.source === 'arxiv' ? null : links.hf},
    };
};

export const shapePapersView = (stored: LabDayStored, today: string): LabPapersView => {
    const papers = stored.papers.map(toView);
    const tracks = LAB_TRACKS.flatMap((track) => {
        const rows = papers.filter((p) => p.track === track);
        return rows.length > 0 ? [{track, papers: rows}] : [];
    });
    const digest = stored.digest
        ? {
            headline: stored.digest.headline,
            model: stored.digest.model,
            bullets: stored.digest.bullets.flatMap((bullet) => {
                const refs = bullet.papers.flatMap((i) => (papers[i] ? [{n: papers[i].n, id: papers[i].id, title: papers[i].title}] : []));
                return refs.length > 0 ? [{text: bullet.text, refs}] : [];
            }),
        }
        : null;
    return {day: stored.day, stale: stored.day !== today, counts: stored.counts, tracks, digest: digest && digest.bullets.length > 0 ? digest : null};
};
