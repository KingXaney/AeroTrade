// Copy for a simulated record's tiles (components/strategies/SimulatedStats.tsx): the stored
// backtest's own tiles on a strategy page (#simulated-stats) and the same tiles for one setting
// in the what-if lab (#whatif-stats). Labels and hints only — each says what a figure was
// measured over, never whether it is good. The test holds every line to the 'copy' tier of
// lib/learn/banned.ts. Client-safe and import-free: the tiles render in client trees, and the
// figures arrive already formatted.

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export const SIM_STATS_COPY = {
    totalReturn: 'Total return',
    totalReturnHint: 'simulated window',
    vsSpy: 'vs SPY',
    // SPY's own return over the same simulated window, formatted as the tile beside it is.
    vsSpyHint: (spy: string): string => `SPY ${spy}`,
    cagr: 'CAGR',
    cagrHint: 'annualised',
    maxDrawdown: 'Max drawdown',
    maxDrawdownHint: 'peak to trough',
    volatility: 'Volatility',
    volatilityHint: 'annualised',
    winRate: 'Win rate',
    winRateNone: 'no closed trades',
    winRateHint: ({wins, losses, tradeCount}: {wins: number; losses: number; tradeCount: number}): string =>
        `${wins}W / ${losses}L · ${plural(tradeCount, 'fill', 'fills')}`,
} as const;
