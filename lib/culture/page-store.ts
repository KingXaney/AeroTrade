// Read side for /culture and its two dashboard widgets (NOT a 'use server' module): the brand
// board and a brand's evidence, the pickers' records and decisions, and the system view. Every
// read is global — the brain and its accounts belong to no reader — and cached per request;
// the shaping is lib/culture/page-view.ts (pure).

import {cache} from "react";
import AccountSnapshot from "@/database/models/account-snapshot.model";
import {connectToDatabase} from "@/database/mongoose";
import {THESIS_WEIGHT_THRESHOLD} from "@/lib/brain/config";
import type {CultureBacktestView, SimulatedVariantView} from "@/lib/culture/backtest";
import {getCultureBacktest} from "@/lib/culture/backtest-store";
import {brandById} from "@/lib/culture/catalog";
import {CULTURE_OWNER_ID, CULTURE_PROFILES, LIVE_PROFILES, type ProfileId} from "@/lib/culture/config";
import type {CultureDecisionItem} from "@/lib/culture/decisions";
import {
    boardMarks,
    comparisonRows,
    groupBrands,
    risingBrands,
    type BoardGroup,
    type BoardMarks,
    type BrandRow,
    type ComparisonRow,
    type ProfileRecord,
} from "@/lib/culture/page-view";
import {
    countReportDates,
    getCultureDecisionsForDates,
    getCultureStates,
    getLatestCultureDecision,
    getWeekUniverse,
    type CultureDecisionView,
    type CultureStateView,
} from "@/lib/culture/picker-store";
import {
    brandsWithoutRecentViews,
    getAllCultureEntities,
    getBrandEvidence,
    getCultureCounts,
    getSourceFreshness,
    getSuggestions,
    type CultureCounts,
    type EvidenceItem,
    type SuggestionRow,
} from "@/lib/culture/store";
import type {CultureBrand, CultureSource} from "@/lib/culture/types";
import {getEasternDateString, getEasternWeekKey} from "@/lib/dates";
import {getJobHealth, type JobHealth} from "@/lib/jobs/health";
import {JOBS} from "@/lib/jobs/registry";
import {PROFILE_COPY} from "@/lib/learn/copy/culture";
import {glossCultureReasons} from "@/lib/learn/culture-reasons";
import type {ReasonClause} from "@/lib/learn/reasons";
import {getAccountAnalytics} from "@/lib/trading/analytics-store";
import {getTradeHistory} from "@/lib/trading/ledger";
import type {AccountAnalytics, PaperTradeRecord, PerfPoint} from "@/lib/trading/types";

const EVIDENCE_DAYS = 21;
const EVIDENCE_LIMIT = 30;
const RISING_LIMIT = 8;
const TRADES_LIMIT = 50;
const DRIFT_DAYS = 10;
const SUGGESTIONS_LIMIT = 20;

const cEntities = cache(() => getAllCultureEntities());
const cStates = cache(() => getCultureStates());
const cWeekUniverse = cache(async () => {
    const weekKey = getEasternWeekKey(getEasternDateString());
    return {weekKey, rows: await getWeekUniverse(weekKey)};
});

// ---- the brands view ----

export type BrandsView = {
    groups: BoardGroup[];
    marks: BoardMarks;
    rising: BrandRow[];
    // The week whose quote check marked owners unpriced; null before the first check.
    unpricedWeek: string | null;
    thesisThreshold: number;
    evidence: {brand: CultureBrand; items: EvidenceItem[]; days: number} | null;
};

export const getCultureBrandsView = cache(async (brandId: string | null): Promise<BrandsView> => {
    const brand = brandId ? brandById(brandId) : undefined;
    const [entities, universe, items] = await Promise.all([
        cEntities(),
        cWeekUniverse(),
        brand ? getBrandEvidence(brand.id, EVIDENCE_DAYS, EVIDENCE_LIMIT) : Promise.resolve([] as EvidenceItem[]),
    ]);
    const unquoted = new Set(universe.rows.filter((row) => !row.quoted).map((row) => row.symbol));
    const groups = groupBrands(entities, unquoted);
    return {
        groups,
        marks: boardMarks(groups),
        rising: risingBrands(entities, RISING_LIMIT),
        unpricedWeek: universe.rows.length > 0 ? universe.weekKey : null,
        thesisThreshold: THESIS_WEIGHT_THRESHOLD,
        evidence: brand ? {brand, items, days: EVIDENCE_DAYS} : null,
    };
});

export const getRisingBrands = async (limit: number = RISING_LIMIT): Promise<BrandRow[]> => risingBrands(await cEntities(), limit);

// ---- the pickers view ----

export type GlossedDecisionItem = CultureDecisionItem & {gloss: ReasonClause[]};
export type GlossedDecision = Omit<CultureDecisionView, 'items'> & {items: GlossedDecisionItem[]};

// What components/culture/CultureRecord draws for the live half.
export type LiveRecordView = {
    series: PerfPoint[];
    // The analytics tiles read their six stat fields off it (components/trading/portfolio/AnalyticsStats).
    stats: AccountAnalytics;
    since: string;
    snapshotDays: number;
    benchmarkReturnPct: number | null;
    totalReturnPct: number;
};

export type FillReplay = {reasons: string[]; gloss: ReasonClause[]};

export type PickerView = {
    id: ProfileId;
    label: string;
    follows: string;
    accountName: string;
    state: CultureStateView | null;
    analytics: AccountAnalytics | null;
    live: LiveRecordView | null;
    decision: GlossedDecision | null;
    trades: PaperTradeRecord[];
    // By trade id: the decision item that placed each culture fill on the log.
    fillReplays: Record<string, FillReplay>;
    // This profile's variant of the stored backtest, once one is built.
    simulated: SimulatedVariantView | null;
};

export type PicksView = {pickers: PickerView[]; comparison: ComparisonRow[]; started: boolean; backtest: CultureBacktestView | null};

// Each decision's reasons decoded here, on the server, so the panel renders clauses without
// bundling the grammar.
const withGloss = (decision: CultureDecisionView | null): GlossedDecision | null => decision && {
    ...decision,
    items: decision.items.map((item) => ({...item, gloss: glossCultureReasons(item.reasons)})),
};

const countSnapshots = async (accountId: string): Promise<number> => {
    await connectToDatabase();
    return AccountSnapshot.countDocuments({accountId});
};

const toLiveRecord = (analytics: AccountAnalytics, snapshotDays: number): LiveRecordView => ({
    series: analytics.series,
    stats: analytics,
    since: getEasternDateString(new Date(analytics.account.inceptionAt)),
    snapshotDays,
    // SPY's total return since inception, on the same basis as the curve's last point.
    benchmarkReturnPct: analytics.series.at(-1)?.benchmarkPct ?? null,
    totalReturnPct: analytics.summary.totalReturnPct,
});

// The decision item behind each culture fill: the same profile, the fill's day, its symbol and side.
const replaysFor = async (profile: ProfileId, trades: readonly PaperTradeRecord[]): Promise<Record<string, FillReplay>> => {
    const fills = trades.filter((trade) => trade.source === 'culture-brain');
    const dateOf = (trade: PaperTradeRecord) => getEasternDateString(new Date(trade.createdAt));
    const decisions = await getCultureDecisionsForDates(profile, fills.map(dateOf));
    const byDate = new Map(decisions.map((decision) => [decision.date, decision]));
    const replays: Record<string, FillReplay> = {};
    for (const trade of fills) {
        const item = byDate.get(dateOf(trade))?.items.find((candidate) => candidate.symbol === trade.symbol && candidate.action === trade.side);
        if (item) replays[trade.id] = {reasons: item.reasons, gloss: glossCultureReasons(item.reasons)};
    }
    return replays;
};

const readPicker = async (id: ProfileId, state: CultureStateView | null, backtest: CultureBacktestView | null): Promise<PickerView> => {
    const [analytics, decision, trades, snapshotDays] = await Promise.all([
        state ? getAccountAnalytics(CULTURE_OWNER_ID, state.accountId) : Promise.resolve(null),
        getLatestCultureDecision(id),
        state ? getTradeHistory(CULTURE_OWNER_ID, state.accountId, TRADES_LIMIT) : Promise.resolve([] as PaperTradeRecord[]),
        state ? countSnapshots(state.accountId) : Promise.resolve(0),
    ]);
    return {
        id,
        label: CULTURE_PROFILES[id].label,
        follows: PROFILE_COPY[id],
        accountName: CULTURE_PROFILES[id].accountName ?? CULTURE_PROFILES[id].label,
        state,
        analytics,
        live: analytics ? toLiveRecord(analytics, snapshotDays) : null,
        decision: withGloss(decision),
        trades,
        fillReplays: await replaysFor(id, trades),
        simulated: backtest?.variants.find((variant) => variant.profile === id) ?? null,
    };
};

export const getCulturePicksView = cache(async (): Promise<PicksView> => {
    const [states, backtest] = await Promise.all([cStates(), getCultureBacktest()]);
    const pickers = await Promise.all(LIVE_PROFILES.map((id) => readPicker(id, states.find((state) => state.profile === id) ?? null, backtest)));
    const records: Partial<Record<ProfileId, ProfileRecord | null>> = {};
    for (const picker of pickers) {
        records[picker.id] = picker.live
            ? {returnPct: picker.live.totalReturnPct, benchmarkReturnPct: picker.live.benchmarkReturnPct, since: picker.live.since}
            : null;
    }
    return {pickers, comparison: comparisonRows(records), started: pickers.some((picker) => picker.live !== null), backtest};
});

// ---- the dashboard tile ----

export type CulturePicksSummary = {
    comparison: ComparisonRow[];
    // The newest decision across the live pickers.
    decisions: {count: number; date: string; kind: CultureDecisionView['kind']} | null;
};

export const getCulturePicksSummary = cache(async (): Promise<CulturePicksSummary> => {
    const view = await getCulturePicksView();
    const latest = view.pickers.map((picker) => picker.decision).filter((decision): decision is GlossedDecision => decision !== null)
        .sort((a, b) => b.date.localeCompare(a.date))[0];
    return {
        comparison: view.comparison,
        decisions: latest ? {count: view.pickers.reduce((sum, picker) => sum + (picker.decision?.date === latest.date ? picker.decision.items.length : 0), 0), date: latest.date, kind: latest.kind} : null,
    };
});

// ---- the system view ----

export type CultureSystemView = {
    counts: CultureCounts;
    freshness: Record<CultureSource, string | null>;
    jobs: JobHealth[];
    accounts: {id: ProfileId; label: string; launchDate: string; lastRunDate: string | null; lastError: string | null}[];
    drift: {brands: string[]; days: number};
    earnings: {configured: boolean; dated: number};
    universe: {weekKey: string; tickers: number; quoted: number} | null;
    suggestions: SuggestionRow[];
};

const earningsConfigured = (): boolean => Boolean((process.env.FINNHUB_API_KEY ?? process.env.NEXT_PUBLIC_FINNHUB_API_KEY ?? '').trim());

export const getCultureSystemView = cache(async (): Promise<CultureSystemView> => {
    const [counts, freshness, jobs, states, drift, dated, universe, suggestions] = await Promise.all([
        getCultureCounts(),
        getSourceFreshness(),
        getJobHealth([JOBS.cultureBrain.id, JOBS.cultureWeekly.id, JOBS.cultureBackfill.id]),
        cStates(),
        brandsWithoutRecentViews(DRIFT_DAYS),
        countReportDates(),
        cWeekUniverse(),
        getSuggestions(SUGGESTIONS_LIMIT),
    ]);
    return {
        counts,
        freshness,
        jobs,
        accounts: LIVE_PROFILES.flatMap((id) => {
            const state = states.find((candidate) => candidate.profile === id);
            return state ? [{id, label: CULTURE_PROFILES[id].label, launchDate: state.launchDate, lastRunDate: state.lastRunDate, lastError: state.lastError}] : [];
        }),
        drift: {brands: drift, days: DRIFT_DAYS},
        earnings: {configured: earningsConfigured(), dated},
        universe: universe.rows.length > 0
            ? {weekKey: universe.weekKey, tickers: universe.rows.length, quoted: universe.rows.filter((row) => row.quoted).length}
            : null,
        suggestions,
    };
});
