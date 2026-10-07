// Paper accounts, positions, trades and analytics, as the trading pages and widgets read them.
import type {AccountIncomeSummary} from '@/lib/income/types';

export type PaperPosition = {
    symbol: string;
    company: string;
    quantity: number;
    avgCost: number;
};

export type EnrichedPosition = PaperPosition & {
    currentPrice?: number;
    changePercent?: number;
    costBasis: number;        // avgCost * quantity
    marketValue: number;      // currentPrice * quantity; the cost basis when priceStale
    unrealizedPnl: number;    // marketValue - costBasis
    unrealizedPnlPct: number; // unrealizedPnl / costBasis * 100
    priceStale: boolean;      // no live quote: marketValue is the cost basis and the P&L above is a placeholder
};

export type PortfolioSummary = {
    startingBalance: number;
    cash: number;
    positions: EnrichedPosition[];
    holdingsValue: number;
    totalValue: number;       // cash + holdingsValue
    totalReturnAbs: number;   // totalValue - startingBalance
    totalReturnPct: number;   // totalReturnAbs / startingBalance * 100
};

// Who placed a paper trade. Absent on rows written before this field existed —
// nothing recorded which historical fills came from the AI, so absence honestly
// means "unknown", never "user".
export type TradeSource = 'user' | 'ai-navigator' | 'ai-suggestion' | 'strategy' | 'culture-brain';

export type PaperTradeRecord = {
    id: string;
    symbol: string;
    company: string;
    side: 'buy' | 'sell';
    quantity: number;
    price: number;
    total: number;
    realizedPnl?: number;
    source?: TradeSource;
    reason?: string;          // why an automated fill happened, in the rule's own words
    accountName?: string;     // set when trades from several accounts are listed together
    createdAt: number;        // epoch milliseconds
};

export type PaperAccountSummary = {
    id: string;
    name: string;
    inceptionAt: number;      // epoch ms; anchors the performance chart
    createdAt: number;        // epoch ms
    // Interest and dividends credited so far (lib/income/accrual.ts); absent before the first credit.
    income?: {interest: number; dividends: number};
};

export type AccountWithPortfolio = {
    account: PaperAccountSummary;
    summary: PortfolioSummary;
};

export type SnapshotPoint = {
    date: string;             // 'YYYY-MM-DD' in America/New_York
    value: number;
};

export type PerfPoint = {
    date: string;
    accountPct: number;           // % return since account inception
    benchmarkPct: number | null;  // % return of SPY over the same window (null before first benchmark point)
};

// The worst peak-to-trough stretch of a value series (lib/trading/analytics.ts
// drawdownWindow). A series that never fell has a zero window: pct 0, peak = trough.
export type DrawdownWindow = {
    pct: number;                        // the fall from the peak, as a positive %
    peakDate: string;
    peakValue: number;
    troughDate: string;
    troughValue: number;
    recovered: boolean;                 // a later point reached the peak value again
    recoveryPctNeeded: number | null;   // peak / trough − 1, as %; null when the trough is not above zero
};

export type AccountAnalytics = {
    account: PaperAccountSummary;
    summary: PortfolioSummary;
    series: PerfPoint[];
    // The last stored daily snapshot's date (null before the first): points after it are
    // today's live value, not a close — the risk lens measures closes only.
    snapshotThrough: string | null;
    maxDrawdownPct: number | null;  // null until enough snapshots exist
    drawdown: DrawdownWindow | null;          // the dated window behind maxDrawdownPct
    benchmarkOverDrawdownPct: number | null;  // SPY total return from its peak date to its trough date
    winRatePct: number | null;      // null until a closed (sell) trade exists
    wins: number;
    losses: number;
    realizedPnl: number;
    tradeCount: number;
    income: AccountIncomeSummary;
};
