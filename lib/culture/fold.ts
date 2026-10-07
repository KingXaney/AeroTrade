// The fold, planned: a run's folds (labelled items, alias matches, attention surprises) and
// every stored brand entity in, the writes and deletes out. The maths is the news brain's own
// pure decay (lib/brain/decay.ts); this adds what the culture brain needs around it — a source
// weight on every fold, a once-per-day guard on attention folds, a once-per-run guard on the
// whole fold, and the catalog as the only source of a brand's name, category and owner. Pure;
// lib/culture/update.ts moves the documents.

import {brandById, CULTURE_BRANDS} from "@/lib/culture/catalog";
import {ENTITY_EPSILON} from "@/lib/brain/config";
import {
    decayEntity,
    foldLink,
    foldMentions,
    pruneLinks,
    shouldDeleteEntity,
    updateThesis,
    type EntityState,
    type Mention,
} from "@/lib/brain/decay";
import {SOURCE_FOLD_WEIGHTS} from "@/lib/culture/config";
import type {CultureBrand, CultureFold} from "@/lib/culture/types";

// A stored brand entity as the planner reads it: the decay state plus its guards.
export type CultureEntityState = EntityState & {
    key: string;
    lastSeenAtMs: number;
    lastFoldRunId: string | null;
    attentionDay: string | null;
};

export type CultureFoldWrite = {key: string; set: Record<string, unknown>};

export type CultureFoldPlan = {
    writes: CultureFoldWrite[];
    deletes: string[];
    entitiesTouched: number;
    attentionFolded: number;
};

// A brand's folds for the run, items and attention apart: the once-a-day guard on attention
// is applied after the once-a-run guard on the whole fold, so a retry counts the same
// entities as the run it retries.
type Grouped = {itemMentions: Mention[]; attentionMentions: Mention[]; coMentions: Map<string, number>};

const freshState = (today: string): EntityState => ({
    weightFast: 0,
    sentimentSumFast: 0,
    weightSlow: 0,
    sentimentSumSlow: 0,
    decayedTo: today,
    links: [],
    thesisSince: null,
    peakSlowWeight: 0,
});

// A fold's importance after its source's weight (news lowest: evidence more than signal).
export const weightedImportance = (fold: CultureFold): number => fold.importance * (SOURCE_FOLD_WEIGHTS[fold.source] ?? 0);

const groupFolds = (folds: readonly CultureFold[], known: (key: string) => boolean): Map<string, Grouped> => {
    const byKey = new Map<string, Grouped>();
    for (const fold of folds) {
        const importance = weightedImportance(fold);
        if (importance <= 0) continue;
        for (const entity of fold.entities) {
            if (!known(entity.key)) continue;
            const entry = byKey.get(entity.key) ?? {itemMentions: [], attentionMentions: [], coMentions: new Map<string, number>()};
            const mention = {sentiment: entity.sentiment, importance, relevance: entity.relevance};
            if (fold.kind === 'attention') entry.attentionMentions.push(mention);
            else entry.itemMentions.push(mention);
            if (fold.kind === 'item') {
                for (const other of fold.entities) {
                    if (other.key === entity.key || !known(other.key)) continue;
                    // Symmetric link mass: the item's importance scaled by both relevances.
                    const add = importance * entity.relevance * other.relevance;
                    entry.coMentions.set(other.key, (entry.coMentions.get(other.key) ?? 0) + add);
                }
            }
            byKey.set(entity.key, entry);
        }
    }
    return byKey;
};

const writeFor = (brand: CultureBrand, state: EntityState, extra: Record<string, unknown>): CultureFoldWrite => ({
    key: brand.id,
    set: {
        displayName: brand.name,
        category: brand.category,
        ticker: brand.owner?.ticker ?? null,
        listing: brand.owner?.listing ?? null,
        weightFast: state.weightFast,
        sentimentSumFast: state.sentimentSumFast,
        weightSlow: state.weightSlow,
        sentimentSumSlow: state.sentimentSumSlow,
        decayedTo: state.decayedTo,
        thesisSince: state.thesisSince,
        peakSlowWeight: state.peakSlowWeight,
        links: state.links,
        ...extra,
    },
});

export const planCultureFold = ({docs, folds, today, nowMs, runId, catalog = CULTURE_BRANDS}: {
    docs: readonly CultureEntityState[];
    folds: readonly CultureFold[];
    today: string;
    nowMs: number;
    runId: string;
    catalog?: readonly CultureBrand[];
}): CultureFoldPlan => {
    const brands = new Map(catalog.map((brand) => [brand.id, brand]));
    const byKey = new Map(docs.map((doc) => [doc.key, doc]));
    const grouped = groupFolds(folds, (key) => brands.has(key));

    const writes: CultureFoldWrite[] = [];
    const touched = new Set<string>();
    let attentionFolded = 0;

    for (const [key, entry] of grouped) {
        const brand = brands.get(key) ?? brandById(key);
        if (!brand) continue;
        const doc = byKey.get(key);
        if (doc && doc.lastFoldRunId === runId) {
            // A step retry after a partly committed fold: this entity already absorbed the run.
            touched.add(key);
            continue;
        }
        // Attention folds once a day; the items fold every run that carries them.
        const attention = doc?.attentionDay === today ? [] : entry.attentionMentions;
        const mentions = [...entry.itemMentions, ...attention];
        if (mentions.length === 0 && entry.coMentions.size === 0) continue;
        touched.add(key);
        let state = decayEntity(doc ?? freshState(today), today);
        state = foldMentions(state, mentions);
        for (const [linkKey, add] of entry.coMentions) state = foldLink(state, linkKey, add);
        state = updateThesis(state, nowMs);
        state = {...state, links: pruneLinks(state.links)};
        if (attention.length > 0) attentionFolded++;
        writes.push(writeFor(brand, state, {
            lastSeenAt: nowMs,
            lastFoldRunId: runId,
            ...(attention.length > 0 ? {attentionDay: today} : {}),
        }));
    }

    // Everything not mentioned this run decays to today too, so the board never shows a weight
    // from last week beside one from this morning.
    const deletes: string[] = [];
    for (const doc of docs) {
        if (touched.has(doc.key)) continue;
        const negligible = doc.weightFast < ENTITY_EPSILON && doc.weightSlow < ENTITY_EPSILON;
        if (negligible) {
            if (shouldDeleteEntity(doc, doc.lastSeenAtMs, nowMs)) deletes.push(doc.key);
            continue;
        }
        if (doc.decayedTo === today) continue;
        const brand = brands.get(doc.key);
        if (!brand) continue;
        let state = decayEntity(doc, today);
        state = updateThesis(state, nowMs);
        state = {...state, links: pruneLinks(state.links)};
        writes.push(writeFor(brand, state, {}));
    }

    return {writes, deletes, entitiesTouched: touched.size, attentionFolded};
};
