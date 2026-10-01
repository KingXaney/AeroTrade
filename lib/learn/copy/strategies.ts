// Copy for the quant-strategy surfaces outside the catalog: the /strategies page (its
// subtitle, the leaderboard's valuation label and empty states, the reading guide), the
// strategy detail page (holdings, trade log and backtest placeholders), the explainer
// panel's headings, the signal board's empty state and stamp, the performance panel, the
// status strip and the dashboard's quant-strategies widget. Every sentence says what a
// record is, how it was produced or when it arrives — never which rule to follow. The test
// holds each one to the 'copy' tier of lib/learn/banned.ts.
//
// Client-safe: StrategyPerformance renders from a client tree.

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export const STRATEGIES_PAGE_COPY = {
    subtitle: 'Eight classic rules, paper-traded live against the S&P 500.',
    loadingSubtitle: 'Valuing eight strategy accounts…',
    // The leaderboard's label: what the live column ranks by and what price it is valued at.
    valuation: (state: 'open' | 'closed' | 'not-started'): string => {
        if (state === 'not-started') return 'no live records yet';
        return state === 'open' ? 'live valuation at the last price' : 'valued at the last close';
    },
    rankedBy: (valuation: string): string => `ranked by live return · ${valuation}`,
    young: (days: number): string =>
        `Live records are under ${days} days old — the simulated column shows each rule's three-year backtest for context.`,
    notRun: 'The strategies have not run yet. Their accounts open on the first trading morning after deployment.',
    // A simulated cell's tooltip on the leaderboard.
    backtestTitle: (from: string, to: string): string => `Backtest ${from} → ${to}, next-open fills, no fees`,
} as const;

export const QUANT_WIDGET_COPY = {
    emptyTitle: 'The strategies have not run yet.',
    emptyDescription: 'The leaderboard fills on the first trading morning.',
} as const;

export const STRATEGY_PAGE_COPY = {
    oneLine: (beginnerLine: string): string => `In one line: ${beginnerLine}`,
    liveSince: (date: string): string => `live since ${date}`,
    notStarted: 'not started',
    holdingsNotStarted: 'Not started — the account opens on the first run.',
    noFills: 'No fills yet — the first orders are placed on the next run that finds a signal.',
    simulatedLog: (fills: number | null): string =>
        `Simulated trade log — ${fills === null ? 'not computed yet' : `${fills} hypothetical fills at the next day's open`}`,
    backtestPending: 'Backtest not computed yet — it is built on the first run.',
} as const;

// The leaderboard's reading guide (components/strategies/HowToRead).
export const HOW_TO_READ_COPY = {
    summary: 'How to read this — live vs simulated, fills, sizing, costs, universe',
    points: [
        {title: 'Live', body: 'A real paper account per strategy, opened on the launch date with $100,000 and traded by the rule every trading morning. Ranked by return since launch, measured against SPY over the same days.'},
        {title: 'Simulated', body: 'The same rule run over three years of stored daily closes ending the day before launch. A backtest: hypothetical, shown apart from live results and never blended into them.'},
        {title: 'Fills', body: 'A decision is made on the previous close and filled at the next session — live about five minutes after the open at the last price, simulated at the next day\'s open. No look-ahead.'},
        {title: 'Sizing', body: 'Whole shares only, sized from the previous close with a 1% buffer, keeping at least 1% cash. Small cash residues are normal.'},
        {title: 'Costs and income', body: 'No commissions and no slippage. Both records earn like a brokerage account: cash earns the 13-week T-bill rate and holdings are paid their dividends. The benchmark is SPY\'s total return, dividends reinvested.'},
        {title: 'Universe', body: 'A fixed list chosen in 2026: SPY and other core ETFs, the eleven sector ETFs and forty large caps. Applied to earlier years it carries survivorship bias, which the simulated numbers inherit.'},
    ] as readonly {title: string; body: string}[],
} as const;

// The headings and parameter labels of a strategy's explainer panel; the sentences under
// them are the catalog's.
export const EXPLAINER_COPY = {
    summary: 'How it works — the rule, its parameters and when it fails',
    rule: 'The rule',
    parameters: 'Parameters',
    why: 'Why it might work',
    fails: 'When it fails',
    watching: 'What it is watching',
    caveats: 'Read the numbers with this in mind',
    universe: 'Universe',
    universeSize: (n: number): string => plural(n, 'symbol', 'symbols'),
    checks: 'Checks',
    nextRebalance: 'Next rebalance',
    cashFloor: 'Cash floor',
    cashFloorValue: '1%',
} as const;

export const SIGNAL_BOARD_COPY = {
    emptyTitle: 'No signals yet.',
    emptyDescription: 'The board fills on the first run, every trading morning after that.',
    stamp: (asOf: string, date: string, stale: number, universeSize: number): string =>
        `As of the ${asOf} close · decided for ${date}${stale > 0 ? ` · ${stale} of ${universeSize} symbols had no fresh bar` : ''}`,
} as const;

export const SIMULATED_TRADES_COPY = {
    none: 'No simulated fills — the rule never triggered over the window.',
    banner: 'Simulated — hypothetical fills at the next day\'s open, no fees or slippage.',
} as const;

// "Performance vs SPY" on a strategy page: what each tab's curve is and how far it reaches.
export const STRATEGY_PERFORMANCE_COPY = {
    liveLine: (since: string, snapshotDays: number, ret: string, spy: string): string =>
        `Live since ${since} · ${plural(snapshotDays, 'daily snapshot', 'daily snapshots')} at 16:10 ET · return ${ret} vs SPY ${spy}`,
    liveStarts: (since: string): string => `The live record starts on ${since}.`,
    curvePending: 'A curve appears after the second daily snapshot; until then the simulated tab shows the rule\'s history.',
    notStarted: 'Not started — no live record yet.',
    simulatedBadge: 'Simulated — backtest, not live',
    simulatedLine: (from: string, to: string, closeFills: number): string =>
        `${from} → ${to} · next-open fills · no fees or slippage · interest and dividends included${closeFills > 0 ? ` · ${plural(closeFills, 'fill', 'fills')} used the close` : ''}`,
    tooShort: 'Not enough stored history to simulate this rule yet.',
} as const;

export const STRATEGY_STATUS_COPY = {
    preview: 'Preview of the catalog — has not run yet',
} as const;
