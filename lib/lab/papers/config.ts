// The lab's papers feed: which arXiv categories each track reads, how many papers a day it keeps
// and the bounds on what is stored and shown. Import-free but for the track type.

import type {LabTrack} from "@/lib/learn/copy/lab/types";

// The categories each track's nightly listing asks arXiv for: the core of the field, not its
// catch-alls (cs.AI and cs.CL are wide enough to drown a listing of sixty).
export const LISTING_CATEGORIES: Readonly<Record<LabTrack, readonly string[]>> = {
    cv: ['cs.CV'],
    ml: ['cs.LG', 'stat.ML'],
    quant: ['q-fin.PM', 'q-fin.ST', 'q-fin.TR', 'q-fin.CP', 'q-fin.RM', 'q-fin.MF'],
};

// The categories that place a paper in a track once it is in hand — wider than the listing, so
// a Hugging Face paper whose primary category is cs.CL or cs.AI lands in machine learning.
export const TRACK_CATEGORIES: Readonly<Record<LabTrack, readonly string[]>> = {
    cv: ['cs.CV'],
    ml: ['cs.LG', 'stat.ML', 'cs.CL', 'cs.AI', 'cs.NE'],
    quant: ['q-fin.PM', 'q-fin.ST', 'q-fin.TR', 'q-fin.CP', 'q-fin.RM', 'q-fin.MF', 'q-fin.GN', 'q-fin.EC'],
};

export const PAPERS_PER_TRACK = 12;
// One listing request per track, newest first; sixty covers a weekday's cs.LG.
export const ARXIV_LISTING_SIZE = 60;
// The one id_list request for the Hugging Face papers the listings did not carry.
export const ARXIV_ID_BATCH = 50;
// arXiv asks for a pause between requests; the job sleeps this between its four.
export const ARXIV_GAP = '3s';
export const FETCH_TIMEOUT_MS = 30_000;
// A paper counts as new when it is not among the ids stored in the last SEEN_WINDOW_DAYS and
// its v1 was published within NOVELTY_DAYS: arXiv's `published` is the first version's instant,
// up to four days before a Monday announcement, so a two-day window would drop Monday's batch.
export const NOVELTY_DAYS = 7;
export const SEEN_WINDOW_DAYS = 7;
export const LAB_DAY_TTL_DAYS = 45;
export const TITLE_MAX = 200;
export const ABSTRACT_STORED_MAX = 1200;
export const ABSTRACT_PROMPT_MAX = 600;
export const AUTHORS_MAX = 8;
export const AUTHORS_SHOWN = 3;
export const DIGEST_MAX_BULLETS = 6;
export const DIGEST_HEADLINE_MAX = 140;
export const DIGEST_BULLET_MAX = 320;
export const PAPERS_PER_BULLET = 3;
// arXiv asks every client to say who it is; the site's own address is the contact.
export const PAPERS_USER_AGENT = 'AeroTrade-lab/1.0 (+https://aerotrading.vercel.app)';
