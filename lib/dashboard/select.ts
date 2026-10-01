// Pure derivations shared by the dashboard page and the widget renderers. The account
// pickers' rule and lists are lib/trading/active-account. Only ambient types
// (types/global.d.ts) and a type-only import, so vitest can load this without mongoose or React.

import type {SuggestionSetView} from '@/lib/navigator/store';
import type {BrainEntitySummary} from '@/lib/brain/types';
import type {StockWithData} from '@/lib/stocks/types';
import type {AccountWithPortfolio} from '@/lib/trading/types';

export type BestAccount = {name: string; totalReturnPct: number};

export type LatestSuggestions = {user: SuggestionSetView | null; global: SuggestionSetView | null};

export type NewsBrainSummary = {
    topThesis: string | null;
    decisions: {count: number; date: string; kind: SuggestionSetView['kind']} | null;
};

// "Best account" only means something against other accounts, so a single
// account (or none — no reduce on an empty array) yields nothing.
export const bestAccount = (portfolios: readonly AccountWithPortfolio[]): BestAccount | undefined => {
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
