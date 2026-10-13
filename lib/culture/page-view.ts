// What the /culture page prints, worked out from plain data: the brand board's category groups
// and the marks its legend lines explain, the rising list, and the side-by-side strip. Pure and
// client-safe; the reads are lib/culture/page-store.ts. Nothing here ranks the pickers — the
// strip keeps the registry's profile order whatever the returns say (invariant 12).

import {brandById, CATEGORY_LABELS} from '@/lib/culture/catalog';
import {CULTURE_PROFILES, LIVE_PROFILES, type ProfileId} from '@/lib/culture/config';
import {CULTURE_CATEGORIES, type CultureCategory, type CultureEntitySummary} from '@/lib/culture/types';

export type BrandRow = CultureEntitySummary & {
    // The listed owner's company, or null for a private brand.
    company: string | null;
    // A private brand's parent, when the catalog names one ('ByteDance').
    parent: string | null;
    // The owner had no live quote in the week's check: scored, but it cannot be held.
    unpriced: boolean;
};

export type BoardGroup = {category: CultureCategory; label: string; rows: BrandRow[]};

// Which legend lines the board prints: only the marks some row carries (invariant 8).
export type BoardMarks = {thesis: boolean; privateBrand: boolean; unpriced: boolean};

const byAttention = (key: 'weightSlow' | 'weightFast') => (a: CultureEntitySummary, b: CultureEntitySummary): number =>
    b[key] - a[key] || a.displayName.localeCompare(b.displayName);

export const toBrandRow = (entity: CultureEntitySummary, unquoted: ReadonlySet<string>): BrandRow => {
    const brand = brandById(entity.key);
    return {
        ...entity,
        company: brand?.owner?.company ?? null,
        parent: brand?.parent ?? null,
        unpriced: entity.ticker !== null && unquoted.has(entity.ticker),
    };
};

// The board: one column per category in the catalog's order, heaviest brand first, a category
// with no entity not drawn.
export const groupBrands = (entities: readonly CultureEntitySummary[], unquoted: ReadonlySet<string>): BoardGroup[] =>
    CULTURE_CATEGORIES
        .map((category) => ({
            category,
            label: CATEGORY_LABELS[category],
            rows: entities.filter((entity) => entity.category === category).sort(byAttention('weightSlow')).map((entity) => toBrandRow(entity, unquoted)),
        }))
        .filter((group) => group.rows.length > 0);

export const boardMarks = (groups: readonly BoardGroup[]): BoardMarks => {
    const rows = groups.flatMap((group) => group.rows);
    return {
        thesis: rows.some((row) => row.thesisSince !== null),
        privateBrand: rows.some((row) => row.ticker === null),
        unpriced: rows.some((row) => row.unpriced),
    };
};

// The fast layer's heaviest brands: this week's attention, whatever the slow layer says.
export const risingBrands = (entities: readonly CultureEntitySummary[], limit: number): BrandRow[] =>
    [...entities]
        .filter((entity) => entity.weightFast > 0)
        .sort(byAttention('weightFast'))
        .slice(0, Math.max(0, limit))
        .map((entity) => toBrandRow(entity, new Set()));

export type ComparisonRow = {
    id: ProfileId | 'spy';
    label: string;
    // Since the account's launch; null before a record exists.
    returnPct: number | null;
    since: string | null;
};

export type ProfileRecord = {returnPct: number; benchmarkReturnPct: number | null; since: string};

// The strip: each live profile in registry order, then SPY over the earliest-launched account's
// days (its own benchmark leg, so the two figures cover the same sessions).
export const comparisonRows = (records: Partial<Record<ProfileId, ProfileRecord | null>>): ComparisonRow[] => {
    const started = LIVE_PROFILES.map((id) => records[id]).filter((record): record is ProfileRecord => record != null);
    const earliest = [...started].sort((a, b) => a.since.localeCompare(b.since))[0];
    return [
        ...LIVE_PROFILES.map((id) => ({
            id,
            label: CULTURE_PROFILES[id].label,
            returnPct: records[id]?.returnPct ?? null,
            since: records[id]?.since ?? null,
        })),
        {id: 'spy', label: 'SPY', returnPct: earliest?.benchmarkReturnPct ?? null, since: earliest?.since ?? null},
    ];
};
