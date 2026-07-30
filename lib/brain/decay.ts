// Dual-timescale entity decay/fold math for the news brain. Everything here is
// pure: callers pass dates/times in, inputs are never mutated, and no I/O happens,
// so the module is directly unit-testable and safe to reuse in jobs and tools.

import {
    DAILY_DECAY_FAST,
    DAILY_DECAY_SLOW,
    ENTITY_EPSILON,
    ENTITY_STALE_DAYS,
    LINK_EPSILON,
    THESIS_EXIT_FRACTION,
    THESIS_WEIGHT_THRESHOLD,
} from "@/lib/brain/config";

export type EntityState = {
    weightFast: number;
    sentimentSumFast: number;
    weightSlow: number;
    sentimentSumSlow: number;
    decayedTo: string; // 'YYYY-MM-DD'
    links: {key: string; weight: number}[];
    thesisSince: number | null; // epoch ms
    peakSlowWeight: number;
};

export type Mention = {sentiment: number; importance: number; relevance: number};

const MS_PER_DAY = 86_400_000;

// Below this, a weight is treated as zero to avoid dividing by float dust.
const ZERO_WEIGHT_GUARD = 1e-9;

// Fresh link objects so returned states never alias the caller's arrays.
const cloneLinks = (links: {key: string; weight: number}[]): {key: string; weight: number}[] =>
    links.map((link) => ({...link}));

// Anchor at UTC midnight so day math is timezone- and DST-proof.
const utcMidnightMs = (date: string): number => Date.parse(`${date}T00:00:00Z`);

export const daysBetween = (fromDate: string, toDate: string): number => {
    const diff = utcMidnightMs(toDate) - utcMidnightMs(fromDate);
    // Clock skew or replays can hand us a past date; decaying "backwards" would
    // inflate weights, so clamp to 0 instead.
    return Math.max(0, Math.round(diff / MS_PER_DAY));
};

export const decayEntity = (e: EntityState, today: string): EntityState => {
    const days = daysBetween(e.decayedTo, today);
    const fastFactor = DAILY_DECAY_FAST ** days;
    const slowFactor = DAILY_DECAY_SLOW ** days;
    return {
        ...e,
        weightFast: e.weightFast * fastFactor,
        sentimentSumFast: e.sentimentSumFast * fastFactor,
        weightSlow: e.weightSlow * slowFactor,
        sentimentSumSlow: e.sentimentSumSlow * slowFactor,
        // Links encode narrative structure, so they persist like theses do:
        // decay on the slow timescale, not the fast display layer.
        links: e.links.map((link) => ({key: link.key, weight: link.weight * slowFactor})),
        decayedTo: today,
    };
};

export const foldMentions = (e: EntityState, mentions: Mention[]): EntityState => {
    let weightAdd = 0;
    let sentimentAdd = 0;
    for (const mention of mentions) {
        const contribution = mention.importance * mention.relevance;
        weightAdd += contribution;
        sentimentAdd += mention.sentiment * contribution;
    }
    return {
        ...e,
        weightFast: e.weightFast + weightAdd,
        sentimentSumFast: e.sentimentSumFast + sentimentAdd,
        weightSlow: e.weightSlow + weightAdd,
        sentimentSumSlow: e.sentimentSumSlow + sentimentAdd,
        links: cloneLinks(e.links),
    };
};

export const foldLink = (e: EntityState, key: string, addWeight: number): EntityState => {
    const exists = e.links.some((link) => link.key === key);
    const links = exists
        ? e.links.map((link) => (link.key === key ? {key: link.key, weight: link.weight + addWeight} : {...link}))
        : [...cloneLinks(e.links), {key, weight: addWeight}];
    return {...e, links};
};

export const updateThesis = (e: EntityState, todayMs: number): EntityState => {
    const next: EntityState = {...e, links: cloneLinks(e.links)};

    if (next.thesisSince === null) {
        if (next.weightSlow >= THESIS_WEIGHT_THRESHOLD) {
            next.thesisSince = todayMs;
            next.peakSlowWeight = next.weightSlow;
        }
        return next;
    }

    const peak = Math.max(next.peakSlowWeight, next.weightSlow);
    if (next.weightSlow < THESIS_EXIT_FRACTION * peak) {
        // Exit ends this update — no immediate re-entry even if the weight still
        // clears the entry threshold, so the thesis flag can't flap in one call.
        next.thesisSince = null;
        next.peakSlowWeight = 0;
        return next;
    }

    next.peakSlowWeight = peak;
    return next;
};

export const pruneLinks = (links: {key: string; weight: number}[]): {key: string; weight: number}[] =>
    links.filter((link) => link.weight >= LINK_EPSILON).map((link) => ({...link}));

export const shouldDeleteEntity = (e: EntityState, lastSeenAtMs: number, todayMs: number): boolean => {
    const bothWeightsNegligible = e.weightFast < ENTITY_EPSILON && e.weightSlow < ENTITY_EPSILON;
    const stale = todayMs - lastSeenAtMs > ENTITY_STALE_DAYS * MS_PER_DAY;
    return bothWeightsNegligible && stale;
};

export const sentimentAvg = (sum: number, weight: number): number =>
    Math.abs(weight) < ZERO_WEIGHT_GUARD ? 0 : sum / weight;
