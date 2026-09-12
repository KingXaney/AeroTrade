// Pure derivations shared by the dashboard page and the widget renderers.
// Only ambient types (types/global.d.ts) and a type-only import, so vitest can
// load this without mongoose or React.

import type {SuggestionSetView} from '@/lib/navigator/service';
import {countUnpriced} from '@/lib/trading/analytics';

export type BestStrategy = {name: string; totalReturnPct: number};

// Shapes consumed by SuggestionPanel / AccountSwitcher / AccountComparisonTable,
// re-declared here because importing the components would pull React in.
export type ApplyAccount = {id: string; name: string};
export type SwitcherAccount = {id: string; name: string; totalReturnPct?: number; unpriced?: number; holdings?: number};
export type ComparisonRow = {
    id: string;
    name: string;
    totalValue: number;
    totalReturnPct: number;
    winRatePct: number | null;
    maxDrawdownPct: number | null;
    unpriced: number;         // holdings with no live quote — the return above is partly at cost
    holdings: number;
};
export type ComparisonStat = {winRatePct: number | null; maxDrawdownPct: number | null};

export type LatestSuggestions = {user: SuggestionSetView | null; global: SuggestionSetView | null};

export type NewsBrainSummary = {
    topThesis: string | null;
    decisions: {count: number; date: string; kind: SuggestionSetView['kind']} | null;
};

// ?account= or the cookie wins when it names one of the user's accounts;
// otherwise the first account. Undefined only when the user has none.
export const pickActiveAccount = (
    portfolios: readonly AccountWithPortfolio[],
    preferredId?: string | null,
): AccountWithPortfolio | undefined =>
    (preferredId ? portfolios.find((x) => x.account.id === preferredId) : undefined) ?? portfolios[0];

// "Best strategy" only means something against other strategies, so a single
// account (or none — no reduce on an empty array) yields nothing.
export const bestStrategy = (portfolios: readonly AccountWithPortfolio[]): BestStrategy | undefined => {
    if (portfolios.length < 2) return undefined;
    let top = portfolios[0];
    for (const x of portfolios) {
        if (x.summary.totalReturnPct > top.summary.totalReturnPct) top = x;
    }
    return {name: top.account.name, totalReturnPct: top.summary.totalReturnPct};
};

export const topMovers = (movers: readonly StockWithData[], n = 4): StockWithData[] =>
    movers
        .filter((m) => typeof m.changePercent === 'number' && Number.isFinite(m.changePercent))
        .sort((a, b) => Math.abs(b.changePercent as number) - Math.abs(a.changePercent as number))
        .slice(0, Math.max(0, n));

export const toApplyAccounts = (portfolios: readonly AccountWithPortfolio[]): ApplyAccount[] =>
    portfolios.map((x) => ({id: x.account.id, name: x.account.name}));

export const toSwitcherAccounts = (portfolios: readonly AccountWithPortfolio[]): SwitcherAccount[] =>
    portfolios.map((x) => ({
        id: x.account.id,
        name: x.account.name,
        totalReturnPct: x.summary.totalReturnPct,
        unpriced: countUnpriced(x.summary.positions),
        holdings: x.summary.positions.length,
    }));

export const toComparisonRows = (
    portfolios: readonly AccountWithPortfolio[],
    stats: Record<string, ComparisonStat | undefined>,
): ComparisonRow[] =>
    portfolios.map((x) => ({
        id: x.account.id,
        name: x.account.name,
        totalValue: x.summary.totalValue,
        totalReturnPct: x.summary.totalReturnPct,
        winRatePct: stats[x.account.id]?.winRatePct ?? null,
        maxDrawdownPct: stats[x.account.id]?.maxDrawdownPct ?? null,
        unpriced: countUnpriced(x.summary.positions),
        holdings: x.summary.positions.length,
    }));

// Theses arrive strongest-first; the user's own suggestion set outranks the
// global one (same precedence as the /brain page).
export const newsBrainSummary = (
    theses: readonly BrainEntitySummary[],
    suggestions: LatestSuggestions,
): NewsBrainSummary => {
    const latest = suggestions.user ?? suggestions.global;
    return {
        topThesis: theses[0]?.displayName ?? null,
        decisions: latest ? {count: latest.items.length, date: latest.date, kind: latest.kind} : null,
    };
};
