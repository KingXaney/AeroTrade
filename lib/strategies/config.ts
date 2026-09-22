// Rails for the quant-strategies system. Every strategy trades through these
// constants; the catalog only chooses rules and parameters on top of them.

// Owner of every strategy paper account. Never 'global' — that is SuggestionSet's owner.
export const STRATEGY_OWNER_ID = 'system:strategies';

export const STRATEGY_STARTING_BALANCE = 100_000;

// Cash floor kept in every account; slots share what is left.
export const CASH_FLOOR = 0.01;
export const slotWeight = (slots: number): number => (1 - CASH_FLOOR) / slots;

// Buys are sized from the previous close × (1 + buffer). A larger gap-up bounces the
// order at the fill (cash floor); the period is then not consumed, so the rule re-plans
// on the next fresh day whatever its cadence.
export const PRICE_BUFFER = 0.01;

// A held, targeted position is only trimmed or topped up when its drift exceeds this
// fraction of equity. Entries and exits are unconditional.
export const DEFAULT_DRIFT_BAND = 0.02;

// decide() always sees exactly this many bars ≤ asOf, live and simulated alike, so an
// indicator can never depend on how much older history happens to be stored.
export const LOOKBACK_BARS = 260;
export const WARMUP_BARS = LOOKBACK_BARS;
// Wilder RSI is recursive; a fixed seed window keeps it independent of series length.
export const RSI_LOOKBACK = 100;

// Simulated track record: three years of daily results before launch.
export const SIM_RESULT_BARS = 756;

// A strategy skips its day when more than this share of its universe has no fresh bar.
export const STALE_SKIP_FRACTION = 0.10;

export const STRATEGY_RUN_TTL_DAYS = 400;
export const TRADE_REASON_MAX = 200;

// Bump when rebalance/simulation/indicator semantics change; a strategy's own
// `version` bumps for a rule or parameter change. Either re-runs its backtest.
export const ENGINE_VERSION = '2';
