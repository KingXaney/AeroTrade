// The weekly pickers' run, the pure parts: which day a run decides for and in what mode, the
// fill request an order becomes, and the summary line. The DB halves are
// lib/culture/picker-store.ts; the decision itself is lib/culture/engine.ts. The job wrapper is
// lib/jobs/functions/culture.ts.

import {CULTURE_RAILS, type ProfileId} from "@/lib/culture/config";
import {getEasternDateString, getEasternWeekKey} from "@/lib/dates";
import type {PlannedOrder} from "@/lib/navigator/allocator";
import {marketStatus, previousTradingDay} from "@/lib/prices/market-hours";

export type CultureEventData = {dryRun?: boolean; resimulate?: boolean; force?: boolean};

export type CultureDay = {
    today: string;
    weekKey: string;
    // The last completed session the decision may read.
    asOf: string;
    force: boolean;
    resimulate: boolean;
    dryRun: boolean;
    mode: 'live' | 'preview';
};

// Anchored to the trigger instant `at`: Inngest re-runs the function body once per step, so a
// run that crosses the close keeps its mode and its day. Outside the session a run previews:
// filling at an after-hours quote on signals already a day old is not the picker's rule.
export const cultureDay = (data: CultureEventData, at: Date): CultureDay => {
    const force = data.force === true;
    const today = getEasternDateString(at);
    const dryRun = data.dryRun === true || (!force && marketStatus(at).state !== 'open');
    return {
        today,
        weekKey: getEasternWeekKey(today),
        asOf: previousTradingDay(today),
        force,
        resimulate: data.resimulate === true,
        dryRun,
        mode: dryRun ? 'preview' : 'live',
    };
};

// The fill request one of a picker's orders becomes, through the path users trade on. One
// fill per picker, week, side and symbol: a replayed step, the holiday retry and a hand
// re-fire later in the week all find the earlier fill.
export const cultureOrderRequest = (profile: ProfileId, accountId: string, order: PlannedOrder, weekKey: string, totalValue: number) => ({
    accountId,
    symbol: order.symbol,
    side: order.side,
    quantity: order.quantity,
    source: 'culture-brain' as const,
    reason: order.reason,
    idempotencyKey: `culture:${profile}:${weekKey}:${order.side}:${order.symbol}`,
    // Re-enforce the cash floor at execution time: live prices may have drifted since planning.
    ...(order.side === 'buy' ? {minCashAfter: CULTURE_RAILS.minCashWeight * totalValue} : {}),
});

export type ProfileRunSummary = {
    profile: ProfileId;
    kind: 'executed' | 'preview' | 'skipped';
    orders: number;
    filled: number;
    note?: string;
};

export type WeeklyRunParts = {
    mode: 'live' | 'preview';
    universe: {tickers: number; quoted: number};
    feeds: readonly string[];
    earnings: {ok: boolean; skipped: boolean; dated: number};
    profiles: readonly ProfileRunSummary[];
    backtest?: string;
};

export const describeWeeklyRun = (p: WeeklyRunParts): string => {
    const profiles = p.profiles.map((s) => {
        const head = `${s.profile}: ${s.kind === 'skipped' ? 'already ran this week' : s.kind === 'preview' ? `${s.orders} order(s) planned (preview)` : `${s.filled}/${s.orders} order(s) filled`}`;
        return s.note ? `${head} — ${s.note}` : head;
    }).join('; ');
    const earnings = p.earnings.skipped ? 'no earnings calendar (no Finnhub key)' : p.earnings.ok ? `${p.earnings.dated} report dates` : 'earnings calendar failed';
    return `Culture pickers (${p.mode}): ${p.universe.quoted}/${p.universe.tickers} owners quoted; feeds ${p.feeds.join(', ')}; ${earnings}. ${profiles}${p.backtest ? `. Backtest: ${p.backtest}` : ''}`;
};
