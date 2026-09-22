// The fixed, reproducible universe every strategy draws from. Chosen in 2026 and
// applied to earlier bars in the simulation, so the large-cap list carries
// survivorship bias — every large-cap strategy's explainer says so.

import {BENCHMARK_SYMBOL} from "@/lib/constants";
import {SECTOR_TO_ETF} from "@/lib/navigator/config";

export type UniverseKey = 'spy' | 'sixty-forty' | 'sectors' | 'gem' | 'largecaps';

export const CORE_ETFS: readonly string[] = ['SPY', 'QQQ', 'IWM', 'EFA', 'TLT', 'AGG', 'BIL', 'GLD'];

// The same eleven the navigator maps sectors onto (pinned by test).
export const SECTOR_ETFS: readonly string[] = Object.values(SECTOR_TO_ETF);

// Forty liquid large caps with plain tickers, all listed for more than five years.
export const LARGE_CAPS: readonly string[] = [
    'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'AVGO', 'TSLA', 'JPM', 'V',
    'MA', 'UNH', 'XOM', 'JNJ', 'PG', 'COST', 'HD', 'LLY', 'ABBV', 'KO',
    'PEP', 'MRK', 'CVX', 'WMT', 'BAC', 'ORCL', 'CSCO', 'CRM', 'ADBE', 'NFLX',
    'AMD', 'INTC', 'TMO', 'ACN', 'MCD', 'DIS', 'PFE', 'CAT', 'HON', 'LIN',
];

// Dual momentum's hurdle and legs need total return; their adjusted closes are
// re-based on every distribution, so these are topped up with a deep window.
export const TOTAL_RETURN_SYMBOLS: readonly string[] = CORE_ETFS;

export const UNIVERSES: Record<UniverseKey, readonly string[]> = {
    'spy': [BENCHMARK_SYMBOL],
    'sixty-forty': [BENCHMARK_SYMBOL, 'AGG'],
    'sectors': SECTOR_ETFS,
    'gem': [BENCHMARK_SYMBOL, 'EFA', 'AGG', 'BIL'],
    'largecaps': LARGE_CAPS,
};

export {BENCHMARK_SYMBOL};

export const ALL_STRATEGY_SYMBOLS: readonly string[] = Array.from(new Set([
    ...CORE_ETFS, ...SECTOR_ETFS, ...LARGE_CAPS,
]));
