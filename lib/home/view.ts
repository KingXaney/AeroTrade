// The signed-in Home page as a view-model: the accounts as rows under one total, and the one
// step the page offers next. Pure — the reads behind it are lib/home/page-store.ts.
//
// Home adapts from rows, never from a flag: the step is the first first-week mission not yet
// done (lib/learn/missions.ts derives those from what exists), and once the list is complete,
// hidden or aged out it follows the session instead — the trade desk while the market is open,
// the news while it is closed.

import {countUnpriced} from "@/lib/trading/analytics";
import {HOME_COPY, HOME_STEPS} from "@/lib/learn/copy/home";
import type {Mission} from "@/lib/learn/missions";
import type {AccountWithPortfolio} from "@/lib/trading/types";

export type HomeAccountRow = {
    id: string;
    name: string;
    totalValue: number;
    totalReturnPct: number;
    cash: number;
    holdings: number;
    unpriced: number;      // holdings with no live quote, valued at cost
};

export type HomeAccounts = {
    rows: HomeAccountRow[];
    totalValue: number;
    totalReturnPct: number;
    unpriced: number;
};

export type HomeStep = {
    title: string;
    body: string;
    href: string;
    cta: string;
    // Set while the step is a first-week mission: "2 of 5 first-week steps done".
    progress: string | null;
};

export const toHomeAccounts = (portfolios: readonly AccountWithPortfolio[]): HomeAccounts => {
    const rows = portfolios.map(({account, summary}) => ({
        id: account.id,
        name: account.name,
        totalValue: summary.totalValue,
        totalReturnPct: summary.totalReturnPct,
        cash: summary.cash,
        holdings: summary.positions.length,
        unpriced: countUnpriced(summary.positions),
    }));
    const totalValue = rows.reduce((sum, r) => sum + r.totalValue, 0);
    const starting = portfolios.reduce((sum, p) => sum + p.summary.startingBalance, 0);
    return {
        rows,
        totalValue,
        // The same definition every account uses (value over starting balance), summed first:
        // an average of the accounts' percentages would weigh a $1,000 account like a $100,000 one.
        totalReturnPct: starting > 0 ? ((totalValue - starting) / starting) * 100 : 0,
        unpriced: rows.reduce((sum, r) => sum + r.unpriced, 0),
    };
};

// `missions` in checklist order; `onboarding` is whether the checklist is still showing at all
// (lib/learn/missions.onboardingActive) — a hidden or aged-out list offers none of its steps.
export const nextStep = (missions: readonly Mission[], onboarding: boolean, marketOpen: boolean): HomeStep => {
    const todo = onboarding ? missions.find((m) => !m.done) : undefined;
    if (todo) {
        return {
            title: todo.title,
            body: todo.lesson[0] ?? '',
            href: todo.href,
            cta: HOME_COPY.stepOpen,
            progress: HOME_COPY.stepsDone(missions.filter((m) => m.done).length, missions.length),
        };
    }
    return {...(marketOpen ? HOME_STEPS.marketOpen : HOME_STEPS.marketClosed), progress: null};
};
