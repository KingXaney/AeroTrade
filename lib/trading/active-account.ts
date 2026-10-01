// Which strategy account the UI operates on, and the account lists its pickers show. Pure and
// client-safe: the pages call these, the picker components import the types.
//
// The rule: ?account= first, then the cookie the last switch wrote, then the user's first
// account. A preferred id counts only when it names one of the user's own accounts.

import {ACTIVE_ACCOUNT_COOKIE} from '@/lib/trading/config';
import {countUnpriced} from '@/lib/trading/analytics';

// SuggestionPanel's "apply to" picker.
export type ApplyAccount = {id: string; name: string};
// AccountSwitcher's rows; the figures are optional because a picker may list names only.
export type SwitcherAccount = {
    id: string;
    name: string;
    totalReturnPct?: number;
    unpriced?: number;        // holdings with no live quote — the return is partly at cost
    holdings?: number;
};
// AccountComparisonTable's rows.
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

// The rule's first two steps: the ?account= param, else the active-account cookie.
export const preferredAccountId = (
    param: string | undefined,
    cookies: {get: (name: string) => {value: string} | undefined},
): string | undefined => param ?? cookies.get(ACTIVE_ACCOUNT_COOKIE)?.value;

// ?account= or the cookie wins when it names one of the user's accounts;
// otherwise the first account. Undefined only when the user has none.
export const pickActiveAccount = (
    portfolios: readonly AccountWithPortfolio[],
    preferredId?: string | null,
): AccountWithPortfolio | undefined =>
    (preferredId ? portfolios.find((x) => x.account.id === preferredId) : undefined) ?? portfolios[0];

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
