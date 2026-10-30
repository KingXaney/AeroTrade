// The stored backtest, the pure parts: when it is rebuilt, and what the page prints of it. The
// simulation itself is lib/culture/simulator.ts; the reads and the save are
// lib/culture/backtest-store.ts. Client-safe.

import {CULTURE_PROFILES, CULTURE_TERMS, PROFILE_IDS, SIGNAL_HORIZONS_WEEKS, type CultureFeed, type CultureTerm, type ProfileId} from "@/lib/culture/config";
import type {SignalIcRow} from "@/lib/culture/signal-check";
import type {SeriesPoint, SeriesStats} from "@/lib/strategies/types";
import {toPerfSeries} from "@/lib/strategies/views";
import type {PerfPoint} from "@/lib/trading/types";

export type CultureBacktestStamp = {version: string; catalogHash: string; computedAt: number; signalsVersion: string | null};

// Rebuilt when the engine version or the catalog's owners changed, on a resimulate, before any
// build exists, and when its signals were measured under another SIGNALS_VERSION (or not at all).
// A stored build is otherwise final: the same inputs give the same curves.
export const cultureBacktestDue = (
    stamp: CultureBacktestStamp | null,
    {version, catalogHash, resimulate, signalsVersion}: {version: string; catalogHash: string; resimulate: boolean; signalsVersion: string},
): boolean => resimulate || stamp === null || stamp.version !== version || stamp.catalogHash !== catalogHash || stamp.signalsVersion !== signalsVersion;

// A stored variant, as the model keeps it and the page reads it.
export type StoredCultureVariant = {
    profile: string;
    weeks: number;
    turnoverPct: number;
    closeFills: number;
    tradeCount: number;
    points: SeriesPoint[];
    stats: SeriesStats;
};

export type StoredCultureBacktest = {
    version: string;
    catalogHash: string;
    feeds: string[];
    from: string;
    to: string;
    benchmark: SeriesPoint[];
    variants: StoredCultureVariant[];
    // What each signal said against what followed (lib/culture/signal-check); empty before R1.
    signals: SignalIcRow[];
    computedAt: number;
};

// One cell of the signal table: a signal at a horizon, over the weeks it could be measured.
export type SignalCell = {meanIc: number; tStat: number | null; weeks: number; positiveShare: number};

// The table the pickers' view prints: the pickers' whole scores first, in the registry's order,
// then each term in CULTURE_TERMS' order — never sorted by figure — and only the rows and
// horizons that have a figure (invariant 8).
export type SignalRow = ({kind: 'score'; profile: ProfileId} | {kind: 'term'; term: CultureTerm}) & {cells: (SignalCell | null)[]};
export type SignalTable = {horizons: number[]; rows: SignalRow[]};

export const toSignalTable = (rows: readonly SignalIcRow[]): SignalTable | null => {
    const at = new Map(rows.map((row) => [`${row.signal}|${row.horizonWeeks}`, row]));
    const horizons = SIGNAL_HORIZONS_WEEKS.filter((h) => rows.some((row) => row.horizonWeeks === h));
    if (horizons.length === 0) return null;
    const cellsOf = (signal: string): (SignalCell | null)[] => horizons.map((h) => {
        const row = at.get(`${signal}|${h}`);
        return row ? {meanIc: row.meanIc, tStat: row.tStat, weeks: row.weeks, positiveShare: row.positiveShare} : null;
    });
    const scoreRows = (['spike', 'quiet', 'price'] as const)
        .map((profile) => ({kind: 'score' as const, profile, cells: cellsOf(`score:${profile}`)}));
    const termRows = CULTURE_TERMS.map((term) => ({kind: 'term' as const, term, cells: cellsOf(term)}));
    const table = [...scoreRows, ...termRows].filter((row) => row.cells.some((cell) => cell !== null));
    return table.length > 0 ? {horizons: [...horizons], rows: table} : null;
};

export type SimulatedVariantView = {
    profile: ProfileId;
    label: string;
    from: string;
    to: string;
    weeks: number;
    closeFills: number;
    tradeCount: number;
    turnoverPct: number;
    stats: SeriesStats;
    series: PerfPoint[];
};

export type CultureBacktestView = {
    version: string;
    computedAt: number;
    from: string;
    to: string;
    feeds: CultureFeed[];
    // SPY's total return over the window, from the variants' shared benchmark.
    benchmarkReturnPct: number | null;
    // In the registry's order (Spike, Quiet, then the price-only control), never by return.
    variants: SimulatedVariantView[];
    signals: SignalTable | null;
};

const isProfile = (value: string): value is ProfileId => (PROFILE_IDS as readonly string[]).includes(value);

export const toBacktestView = (stored: StoredCultureBacktest): CultureBacktestView => {
    const variants = PROFILE_IDS.flatMap((profile) => {
        const variant = stored.variants.find((candidate) => candidate.profile === profile);
        if (!variant || !isProfile(variant.profile)) return [];
        return [{
            profile,
            label: CULTURE_PROFILES[profile].label,
            from: variant.points[0]?.date ?? stored.from,
            to: variant.points[variant.points.length - 1]?.date ?? stored.to,
            weeks: variant.weeks,
            closeFills: variant.closeFills,
            tradeCount: variant.tradeCount,
            turnoverPct: variant.turnoverPct,
            stats: variant.stats,
            series: toPerfSeries(variant.points, stored.benchmark),
        }];
    });
    return {
        version: stored.version,
        computedAt: stored.computedAt,
        from: stored.from,
        to: stored.to,
        feeds: stored.feeds.filter((feed): feed is CultureFeed => typeof feed === 'string') as CultureFeed[],
        benchmarkReturnPct: variants[0]?.stats.benchmarkReturnPct ?? null,
        variants,
        signals: toSignalTable(stored.signals),
    };
};
