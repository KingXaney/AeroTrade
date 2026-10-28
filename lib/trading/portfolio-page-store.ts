// The /portfolio page's one read (app/(root)/portfolio/page.tsx): the active account and every
// read hung off it, shaped by lib/trading/portfolio-page.ts. Server only.

import {getPortfoliosForUser} from "@/lib/trading/valuation";
import {getTradeLedger} from "@/lib/trading/ledger";
import {getAccountAnalytics, getComparisonStats} from "@/lib/trading/analytics-store";
import {getIncomeActivity} from "@/lib/income/page-store";
import {countUnpriced} from "@/lib/trading/analytics";
import {getLuckOrSkill} from "@/lib/trading/learn/luck-store";
import {getTradingHabits} from "@/lib/trading/learn/habits-store";
import {pickActiveAccount} from "@/lib/trading/active-account";
import {TRADE_HISTORY_LIMIT} from "@/lib/trading/config";
import {marketStatus} from "@/lib/prices/market-hours";
import {tradedBy as readTradedBy, type TradedBy} from "@/lib/trading/traded-by";
import {getFollowDecisionsForDates} from "@/lib/culture/follow-store";
import {cultureFillDates, replaysFromDecisions, type FillReplay} from "@/lib/culture/page-store";
import {toPortfolioPageView, type PortfolioPageView} from "@/lib/trading/portfolio-page";

// `preferredId` is preferredAccountId's answer: ?account=, else the active-account cookie.
// `owner` (lib/lab/owner.ts): the AI Navigator and the culture pickers are the owner's alone, so only
// the owner's page reads who trades an account and the decisions behind its culture fills.
export const getPortfolioPageView = async (userId: string, preferredId: string | undefined, {owner}: {owner: boolean}): Promise<PortfolioPageView> => {
    const all = await getPortfoliosForUser(userId);
    const activeEntry = pickActiveAccount(all, preferredId);
    // getPortfoliosForUser creates the first account, so there always is one.
    if (!activeEntry) throw new Error('No paper account');
    const {account, summary: portfolio} = activeEntry;

    // The page's one ledger read, shared (cache()) with getAccountAnalytics and getIncomeActivity,
    // which hide their own sections when it fails. A failed read hides everything drawn from it
    // here too — the trade log with its receipts and buy notes, the lot notes — rather than
    // showing an empty ledger as "0 trades".
    const ledgerRead = getTradeLedger(userId, account.id).catch((error) => {
        console.error('Portfolio: reading the trade ledger failed:', error);
        return null;
    });
    // Habits derive from the same ledger — no second trade read — and hide with it; their few
    // quotes start the moment it resolves, alongside the page's other reads rather than after
    // them. Luck or skill starts then too: it places the return as the learner's only when the
    // learner placed a fill in this account (not on the Navigator's), the scope habits count.
    const habitsRead = ledgerRead.then((ledger) => (ledger ? getTradingHabits({
        ledger,
        positions: portfolio.positions,
        inceptionAt: account.inceptionAt,
        startingBalance: portfolio.startingBalance,
    }) : null));
    // Its own bounded reads (null = panel hidden); the learner's return is a stored snapshot's.
    const luckRead = ledgerRead.then((ledger) => getLuckOrSkill({
        accountId: account.id,
        inceptionAt: account.inceptionAt,
        startingBalance: portfolio.startingBalance,
        unpriced: countUnpriced(portfolio.positions),
        holdings: portfolio.positions.length,
        // A ledger that could not be read cannot say whose fills these are; the panel reads as before.
        ownFills: ledger === null || ledger.some((trade) => trade.source === 'user'),
    }));
    // Who else trades here (the line under the name; null when nobody or when the read failed),
    // and for an account a culture picker trades, the decision behind each culture fill on the
    // log — read from the enrolment's own decisions, bounded by the fills' dates.
    const tradedByRead: Promise<TradedBy> = !owner ? Promise.resolve(null) : readTradedBy(userId, account.id).catch((error) => {
        console.error('Portfolio: reading who trades in the account failed:', error);
        return null;
    });
    const replaysRead: Promise<Record<string, FillReplay>> = Promise.all([ledgerRead, tradedByRead]).then(async ([ledger, by]) => {
        if (!ledger || by?.kind !== 'culture') return {};
        const tail = ledger.slice(-TRADE_HISTORY_LIMIT);
        return replaysFromDecisions(tail, await getFollowDecisionsForDates(userId, by.profile, cultureFillDates(tail)));
    }).catch((error) => {
        console.error('Portfolio: reading the culture fills\' decisions failed:', error);
        return {};
    });
    const [ledger, analytics, comparisonStats, income, luck, habits, tradedBy, fillReplays] = await Promise.all([
        ledgerRead,
        getAccountAnalytics(userId, account.id),
        getComparisonStats(userId, Object.fromEntries(all.map((x) => [x.account.id, x.summary.totalValue]))),
        getIncomeActivity(userId, account.id),
        luckRead,
        habitsRead,
        tradedByRead,
        replaysRead,
    ]);

    return toPortfolioPageView({
        all,
        active: activeEntry,
        ledger,
        analytics,
        comparisonStats,
        income,
        luck,
        habits,
        marketOpen: marketStatus().state === 'open',
        tradedBy,
        fillReplays,
    });
};
