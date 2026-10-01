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
import {marketStatus} from "@/lib/prices/market-hours";
import {toPortfolioPageView, type PortfolioPageView} from "@/lib/trading/portfolio-page";

// `preferredId` is preferredAccountId's answer: ?account=, else the active-account cookie.
export const getPortfolioPageView = async (userId: string, preferredId: string | undefined): Promise<PortfolioPageView> => {
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
    const [ledger, analytics, comparisonStats, income, luck, habits] = await Promise.all([
        ledgerRead,
        getAccountAnalytics(userId, account.id),
        getComparisonStats(userId, Object.fromEntries(all.map((x) => [x.account.id, x.summary.totalValue]))),
        getIncomeActivity(userId, account.id),
        luckRead,
        habitsRead,
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
    });
};
