// Shaping the paper accounts into something the chat model can read.
//
// Pure on purpose: lib/trading/account.ts reaches lib/actions/* and therefore
// lib/better-auth/auth.ts, whose top-level await opens a DB connection — so anything
// importing it is untestable under vitest (AGENTS.md invariant 1). The mapping and the
// account-name resolution live here so they can be.

/** Money the model is going to read aloud — never hand it 1234.5600000001. */
const money = (n: number): number => Math.round(n * 100) / 100;

export type ChatPosition = {
    symbol: string;
    company: string;
    quantity: number;
    avgCost: number;
    currentPrice: number | null;
    marketValue: number;
    unrealizedPnl: number;
    unrealizedPnlPct: number;
};

export type ChatAccount = {
    name: string;
    inceptionAt: string;
    startingBalance: number;
    cash: number;
    totalValue: number;
    totalReturnPct: number;
    positions: ChatPosition[];
};

export type ChatTrade = {
    symbol: string;
    side: 'buy' | 'sell';
    quantity: number;
    price: number;
    total: number;
    realizedPnl?: number;
    at: string;
};

export type ChatPortfolio = {
    paper: true;
    currency: 'USD';
    total: {
        startingBalance: number;
        cash: number;
        holdingsValue: number;
        totalValue: number;
        totalReturnAbs: number;
        totalReturnPct: number;
    };
    accounts: ChatAccount[];
    recentTrades?: ChatTrade[];
    valuation: {pricedSymbols: number; unpricedSymbols: number};
};

export const toChatPosition = (p: EnrichedPosition): ChatPosition => ({
    symbol: p.symbol,
    company: p.company,
    quantity: p.quantity,
    avgCost: money(p.avgCost),
    // A missing quote is null, never 0 — the model must not read "it's worth nothing".
    currentPrice: typeof p.currentPrice === 'number' ? money(p.currentPrice) : null,
    marketValue: money(p.marketValue),
    unrealizedPnl: money(p.unrealizedPnl),
    unrealizedPnlPct: Math.round(p.unrealizedPnlPct * 100) / 100,
});

export const toChatAccount = (entry: AccountWithPortfolio): ChatAccount => ({
    name: entry.account.name,
    inceptionAt: new Date(entry.account.inceptionAt).toISOString(),
    startingBalance: money(entry.summary.startingBalance),
    cash: money(entry.summary.cash),
    totalValue: money(entry.summary.totalValue),
    totalReturnPct: Math.round(entry.summary.totalReturnPct * 100) / 100,
    positions: entry.summary.positions.map(toChatPosition),
});

export const toChatTrade = (t: PaperTradeRecord): ChatTrade => ({
    symbol: t.symbol,
    side: t.side,
    quantity: t.quantity,
    price: money(t.price),
    total: money(t.total),
    ...(typeof t.realizedPnl === 'number' ? {realizedPnl: money(t.realizedPnl)} : {}),
    at: new Date(t.createdAt).toISOString(),
});

export const toChatPortfolio = (
    accounts: AccountWithPortfolio[],
    total: PortfolioSummary,
    trades?: PaperTradeRecord[],
): ChatPortfolio => {
    const positions = accounts.flatMap((a) => a.summary.positions);
    return {
        paper: true,
        currency: 'USD',
        total: {
            startingBalance: money(total.startingBalance),
            cash: money(total.cash),
            holdingsValue: money(total.holdingsValue),
            totalValue: money(total.totalValue),
            totalReturnAbs: money(total.totalReturnAbs),
            totalReturnPct: Math.round(total.totalReturnPct * 100) / 100,
        },
        accounts: accounts.map(toChatAccount),
        ...(trades ? {recentTrades: trades.map(toChatTrade)} : {}),
        // Surfaced so the prompt can tell the model to call the total approximate. When a
        // quote is missing, computePortfolio falls back to cost basis — which silently
        // reads as a perfectly flat position rather than an unknown one.
        valuation: {
            pricedSymbols: positions.filter((p) => typeof p.currentPrice === 'number').length,
            unpricedSymbols: positions.filter((p) => typeof p.currentPrice !== 'number').length,
        },
    };
};

/**
 * Resolve a user-typed account reference to one of their accounts. The model never sees
 * or supplies ids — same rule findTopic follows for topics.
 */
export const findAccountByName = <T extends {name: string}>(accounts: T[], ref: string): T | undefined => {
    const needle = ref.trim().toLowerCase();
    if (!needle) return undefined;
    return (
        accounts.find((a) => a.name.toLowerCase() === needle) ??
        accounts.find((a) => a.name.toLowerCase().includes(needle))
    );
};
