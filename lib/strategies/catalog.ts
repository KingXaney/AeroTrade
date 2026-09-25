// The eight quant strategies: data only (rules live in lib/strategies/rules), so
// client components can import names, explainers and board columns freely.
// Every sentence here is shown to readers as written — plain, accurate, no hype.

import {DEFAULT_DRIFT_BAND, ENGINE_VERSION} from '@/lib/strategies/config';
import type {StrategyDefinition, StrategyId} from '@/lib/strategies/types';

// Rendered once per strategy page, never twice. It used to appear at the foot of the
// detail page AND inside the reading guide, which is how a disclaimer stops being read.
export const STRATEGIES_DISCLAIMER = 'Deterministic rules · no AI · paper money · not financial advice';

const COMMON_CAVEATS: readonly string[] = [
    'Orders fill at the next session, not at the close that produced the signal.',
    'Buys are sized from the previous close in whole shares; a gap-up can bounce an order until the next day.',
    'No fees and no slippage are charged, and the paper account receives no dividends.',
];

const SURVIVORSHIP_CAVEAT =
    'The 40-name list was chosen in 2026 and applied to earlier years, so simulated results carry survivorship bias.';

const TOTAL_RETURN_CAVEAT =
    'Signals use total return (dividends included) because the T-bill hurdle is entirely yield; the paper account itself earns price return only.';

const CLOSE_COLUMN = {key: 'close', label: 'Last close', format: 'price'} as const;

export const STRATEGIES: readonly StrategyDefinition[] = [
    {
        id: 'buy-and-hold-spy',
        name: 'Buy & Hold SPY',
        family: 'Baseline',
        cadence: 'once',
        universe: 'spy',
        slots: 1,
        version: '1',
        params: {allocation: 0.99},
        driftBand: DEFAULT_DRIFT_BAND,
        signalColumns: [
            CLOSE_COLUMN,
            {key: 'sinceEntry', label: 'Since entry', format: 'pct'},
        ],
        explainer: {
            summary: 'Buys the S&P 500 ETF on its first run and never trades again — the bar every other strategy has to clear.',
            how: [
                'On the first run, puts 99% of the account into SPY and keeps a 1% cash floor.',
                'Never sells, never rebalances, never adds.',
                'If SPY has no fresh bar on the first run, the purchase is deferred to the next day rather than made on stale numbers.',
            ],
            why: [
                'Broad equity indices have compounded through recessions, wars and crashes, and most active strategies fail to beat them after costs.',
                'Doing nothing has no whipsaws, no timing errors and no trading costs.',
            ],
            fails: [
                'It rides every drawdown in full — about −34% in March 2020 and −25% in 2022 — with no defence at all.',
                'Its result is a property of the start date: buying at a market top can take years to recover.',
            ],
            watching: 'Nothing after the first buy — the board simply shows SPY\'s last close and the gain since entry.',
            beginnerLine: 'The strategy most professionals fail to beat is to buy the index and stop looking.',
            cashReason: 'In cash — the first purchase has not happened yet; it fills on the next session with a fresh SPY bar.',
            caveats: [
                ...COMMON_CAVEATS,
                'It understates a real S&P 500 index fund by the dividend yield (roughly 1–2% a year) because the paper account receives no dividends.',
            ],
        },
    },
    {
        id: 'sixty-forty',
        name: '60/40 Quarterly',
        family: 'Allocation',
        cadence: 'quarterly',
        universe: 'sixty-forty',
        slots: 2,
        version: '1',
        params: {spyWeight: 0.6, aggWeight: 0.4},
        driftBand: DEFAULT_DRIFT_BAND,
        signalColumns: [
            CLOSE_COLUMN,
            {key: 'weight', label: 'Current weight', format: 'pct'},
            {key: 'target', label: 'Target', format: 'pct'},
            {key: 'drift', label: 'Drift', format: 'pct'},
        ],
        explainer: {
            summary: 'The classic balanced portfolio: 60% stocks (SPY), 40% bonds (AGG), put back to target every quarter.',
            how: [
                'Targets 60% SPY and 40% AGG of the invested 99%, which is 59.4% and 39.6% of equity.',
                'On the first trading day of January, April, July and October it compares each leg with its target.',
                'A leg is traded only when it has drifted more than 2% of equity from target; smaller drifts are left alone.',
                'Between rebalances it does nothing, whatever the market does.',
            ],
            why: [
                'Diversification is about correlation, not count: stocks and high-grade bonds have usually moved differently, so the mix has a smoother path than either alone.',
                'Rebalancing mechanically sells what has run and buys what has lagged — a small, disciplined contrarian bet.',
            ],
            fails: [
                'When stocks and bonds fall together, as in 2022, there is nowhere to hide and the bond leg cushions nothing.',
                'In long bull markets the bond leg is a drag: 60/40 lags an all-stock portfolio by design.',
                'Quarterly rebalancing is slow; a crash and recovery inside one quarter is simply ridden out.',
            ],
            watching: 'Each leg\'s current weight, its target and the drift between them.',
            beginnerLine: 'Own two things that do not move together, and keep putting them back in proportion.',
            cashReason: 'In cash — the first quarterly allocation has not been made yet; it fills on the next session when both SPY and AGG have fresh bars.',
            caveats: [
                ...COMMON_CAVEATS,
                'The 1% cash floor makes the actual targets 59.4% and 39.6% of equity, and the reasons on this page quote those numbers.',
            ],
        },
    },
    {
        id: 'golden-cross',
        name: 'Golden Cross Sectors',
        family: 'Trend following',
        cadence: 'daily',
        universe: 'sectors',
        slots: 11,
        version: '1',
        params: {fast: 50, slow: 200},
        driftBand: DEFAULT_DRIFT_BAND,
        signalColumns: [
            CLOSE_COLUMN,
            {key: 'sma50', label: 'SMA50', format: 'price'},
            {key: 'sma200', label: 'SMA200', format: 'price'},
            {key: 'spread', label: 'SMA50 vs SMA200', format: 'pct'},
            {key: 'trendOn', label: 'Trend on', format: 'bool'},
        ],
        explainer: {
            summary: 'Holds each of the eleven S&P sector ETFs while its 50-day average is above its 200-day average, and steps out when it is not.',
            how: [
                'Every trading day computes the 50-day and 200-day simple moving averages of each sector ETF\'s close.',
                'A sector is on while SMA50 is strictly above SMA200 (a golden cross) and off otherwise (a death cross).',
                'Each sector that is on gets an equal slot of 9% of equity (99% ÷ 11); a sector that turns off is sold in full at the next session.',
                'On the first run it buys every sector already trending — it does not wait for fresh crosses.',
                'Held slots are not resized on small drift; only a move beyond the 2% band triggers a top-up or trim.',
            ],
            why: [
                'Trends persist more often than chance would suggest, partly because investors under-react to news and then pile in slowly.',
                'Sitting out death-cross regimes has historically skipped the worst stretches of bear markets, at the cost of missing the first leg of recoveries.',
            ],
            fails: [
                'Whipsaws: in a sideways market the averages cross and re-cross, and each round trip loses a little.',
                'It is late by design — a 200-day average confirms a trend months after it started and exits months after it ended.',
                'A V-shaped crash and recovery (March 2020) sells near the bottom and buys back well above it.',
            ],
            watching: 'Each sector\'s close, SMA50, SMA200, the spread between the averages and whether the trend is on.',
            beginnerLine: 'Own what is trending up, step aside from what is trending down, and accept being late both ways.',
            cashReason: 'In cash — no sector ETF has its 50-day average above its 200-day average right now.',
            caveats: [...COMMON_CAVEATS],
        },
    },
    {
        id: 'dual-momentum',
        name: 'Dual Momentum (GEM)',
        family: 'Allocation',
        cadence: 'monthly',
        universe: 'gem',
        slots: 1,
        version: '1',
        params: {lookback: 252},
        driftBand: DEFAULT_DRIFT_BAND,
        signalColumns: [
            CLOSE_COLUMN,
            {key: 'r12', label: '12m total return', format: 'pct'},
            {key: 'aboveHurdle', label: 'Beats T-bills', format: 'bool'},
            {key: 'pick', label: 'Would be chosen', format: 'bool'},
        ],
        explainer: {
            summary: 'Gary Antonacci\'s Global Equities Momentum: each month hold US or international stocks if stocks beat T-bills over the past year, otherwise bonds.',
            how: [
                'On the first trading day of each month computes 12-month (252-bar) total returns, dividends included, for SPY, EFA, AGG and BIL.',
                'Absolute momentum: if SPY\'s 12-month return is above BIL\'s (the T-bill hurdle), stocks are on; otherwise the whole position goes to AGG.',
                'Relative momentum: with stocks on, hold whichever of SPY and EFA has the higher 12-month return; a tie goes to SPY.',
                'The chosen ETF gets 99% of equity; whatever else is held is sold at the next session.',
                'If a return cannot be computed or the chosen ETF has no fresh bar, the rebalance is deferred rather than executed on partial data.',
            ],
            why: [
                'Momentum (Jegadeesh and Titman) is one of the most persistent return anomalies: what led over the past year tends to keep leading for a few months.',
                'Absolute momentum steps aside when stocks are losing to cash, which has historically cut the depth of bear-market drawdowns.',
                'Comparing with T-bills rather than with zero means "stocks are up" is not enough — they have to beat the risk-free alternative.',
            ],
            fails: [
                'Monthly checks and a 12-month lookback mean it can hold stocks through the first months of a crash and switch to bonds near the bottom.',
                'Sharp V-reversals whipsaw it: out after the fall, back in after the recovery.',
                'In 2022 bonds fell too, so the "safe" leg lost money as well.',
            ],
            watching: 'The 12-month total return of each of the four ETFs, whether SPY clears the T-bill hurdle, and which ETF the rule would choose today.',
            beginnerLine: 'Own the winner of the past year — unless the winner is cash, in which case own bonds.',
            cashReason: 'In cash — the first monthly allocation has not been made yet; it fills on the next session when the chosen ETF has a fresh bar.',
            caveats: [...COMMON_CAVEATS, TOTAL_RETURN_CAVEAT],
        },
    },
    {
        id: 'momentum-12-1',
        name: '12-1 Momentum Top 8',
        family: 'Momentum',
        cadence: 'monthly',
        universe: 'largecaps',
        slots: 8,
        version: '1',
        params: {lookback: 252, skip: 21, top: 8},
        driftBand: DEFAULT_DRIFT_BAND,
        signalColumns: [
            CLOSE_COLUMN,
            {key: 'momentum', label: '12-1 return', format: 'pct'},
            {key: 'rank', label: 'Rank', format: 'rank'},
        ],
        explainer: {
            summary: 'Each month buys the eight large caps with the strongest return over the past twelve months, skipping the most recent month.',
            how: [
                'On the first trading day of each month ranks the 40-stock universe by the return from 252 trading days ago to 21 trading days ago (12-1 momentum).',
                'The top 8 each get 12.4% of equity (99% ÷ 8); ties are broken alphabetically.',
                'A held stock that falls out of the top 8 is sold at the next session; a kept one is topped up or trimmed only past the 2% drift band.',
                'Stocks with fewer than 253 bars of history are not ranked.',
                'Between rebalances it publishes the ranking daily but does not trade.',
            ],
            why: [
                'The momentum premium (Jegadeesh and Titman, 1993): past 3–12-month winners have kept outperforming for the next few months across markets and decades.',
                'The last month is skipped because one-month returns tend to reverse (short-term over-reaction), which would add noise to the signal.',
                'Under-reaction and the slow diffusion of news are the usual explanations: prices take months to fully absorb good news.',
            ],
            fails: [
                'Momentum crashes: after a sharp bear market the strategy is loaded with defensive names and misses the violent rebound (2009, April 2020).',
                'It is a crowded trade; when momentum unwinds, everyone is selling the same stocks.',
                'High turnover — a monthly reshuffle of eight names racks up trading costs the paper account does not charge.',
            ],
            watching: 'Each stock\'s 12-1 return and its rank in the universe.',
            beginnerLine: 'Buy what has been going up for a year, ignore the last month, and reshuffle monthly.',
            cashReason: 'In cash — the first monthly ranking has not been traded yet; it fills on the next session once enough history is available.',
            caveats: [...COMMON_CAVEATS, SURVIVORSHIP_CAVEAT],
        },
    },
    {
        id: 'rsi2-mean-reversion',
        name: 'RSI-2 Mean Reversion',
        family: 'Mean reversion',
        cadence: 'daily',
        universe: 'largecaps',
        slots: 5,
        version: '1',
        params: {rsiPeriod: 2, entryRsi: 10, exitSma: 5, trendSma: 200},
        driftBand: DEFAULT_DRIFT_BAND,
        signalColumns: [
            CLOSE_COLUMN,
            {key: 'rsi2', label: 'RSI(2)', format: 'number'},
            {key: 'sma5', label: 'SMA5', format: 'price'},
            {key: 'sma200', label: 'SMA200', format: 'price'},
            {key: 'aboveSma200', label: 'Above SMA200', format: 'bool'},
        ],
        explainer: {
            summary: 'Larry Connors\' RSI-2: buy large caps in an uptrend after a sharp two-day dip and sell them on the first bounce above the 5-day average.',
            how: [
                'Every trading day computes the 2-period RSI, the 5-day and the 200-day simple moving averages of each stock in the 40-name universe.',
                'Entry: not held, close above SMA200 (long-term uptrend) and RSI(2) below 10 (oversold); candidates are ranked by RSI, lowest first.',
                'Exit: held and close above SMA5; exits are decided before entries on the same day.',
                'Up to 5 positions of 19.8% of equity each (99% ÷ 5); open slots are filled by the lowest-RSI candidates.',
                'A stock sold today is not bought back the same day, and held positions are never resized.',
            ],
            why: [
                'Over one to five days, sharp drops in strong stocks tend to bounce (short-term over-reaction) — the mirror image of medium-term momentum.',
                'Requiring the 200-day trend filters out stocks that are dropping because something is actually wrong.',
                'Holding periods are days, so the strategy spends much of its time in cash and sidesteps long declines.',
            ],
            fails: [
                'Catching falling knives: a two-day drop that keeps falling — the exit rule waits for a bounce that may come much lower.',
                'In a bear market almost nothing is above its SMA200, so the strategy sits in cash while a rally starts without it.',
                'Many small trades: the paper account ignores the slippage and commissions that would erode a real version.',
            ],
            watching: 'Each stock\'s RSI(2), close, SMA5 and SMA200, and whether it is above its long-term average.',
            beginnerLine: 'Buy the dip in a strong stock, sell the bounce, repeat.',
            cashReason: 'In cash — no large cap in an uptrend is oversold (RSI(2) below 10) right now.',
            caveats: [...COMMON_CAVEATS, SURVIVORSHIP_CAVEAT],
        },
    },
    {
        id: 'donchian-breakout',
        name: 'Donchian 55/20 Breakout',
        family: 'Breakout',
        cadence: 'daily',
        universe: 'largecaps',
        slots: 8,
        version: '1',
        params: {entryChannel: 55, exitChannel: 20},
        driftBand: DEFAULT_DRIFT_BAND,
        signalColumns: [
            CLOSE_COLUMN,
            {key: 'high55', label: '55-day high', format: 'price'},
            {key: 'low20', label: '20-day low', format: 'price'},
            {key: 'vsHigh', label: 'vs 55-day high', format: 'pct'},
        ],
        explainer: {
            summary: 'The Turtle traders\' channel rule: buy a large cap when it closes above its 55-day high, sell when it closes below its 20-day low.',
            how: [
                'Every trading day computes each stock\'s highest high of the prior 55 bars and lowest low of the prior 20 bars, today\'s bar excluded.',
                'Entry: not held and today\'s close strictly above the 55-day high; candidates are ranked by how far above the channel they closed.',
                'Exit: held and today\'s close strictly below the 20-day low; exits are decided before entries.',
                'Up to 8 positions of 12.4% of equity each (99% ÷ 8); held positions are never resized.',
                'A stock needs 56 bars with highs and lows; without them it is not traded, and a held one is kept.',
            ],
            why: [
                'A new 55-day high is information: every holder is in profit and there is no overhead supply of trapped sellers.',
                'Trend followers profit from the fat right tail — a few large winners pay for many small losses.',
                'The wide exit (20-day low) gives a trend room to breathe instead of shaking the position out on noise.',
            ],
            fails: [
                'Sideways chop: repeated false breakouts that reverse into the exit produce a string of small losses.',
                'It is late by design — entries come after a move is under way and exits give back a chunk of the gain.',
                'A gap down through the 20-day low fills far below the trigger.',
            ],
            watching: 'Each stock\'s close, 55-day high, 20-day low and distance from the entry channel.',
            beginnerLine: 'Buy new highs, sell new lows, and let the winners run.',
            cashReason: 'In cash — no large cap has closed above its 55-day high right now.',
            caveats: [
                ...COMMON_CAVEATS,
                SURVIVORSHIP_CAVEAT,
                'Channels are confirmed on the close, not intraday, and positions are equal-weighted rather than sized by ATR as the original Turtle rules were.',
            ],
        },
    },
    {
        id: 'low-volatility',
        name: 'Low Volatility Top 10',
        family: 'Defensive factor',
        cadence: 'monthly',
        universe: 'largecaps',
        slots: 10,
        version: '1',
        params: {volWindow: 63, top: 10},
        driftBand: DEFAULT_DRIFT_BAND,
        signalColumns: [
            CLOSE_COLUMN,
            {key: 'vol63', label: '63-day vol', format: 'pct'},
            {key: 'rank', label: 'Rank', format: 'rank'},
        ],
        explainer: {
            summary: 'Each month holds the ten large caps with the lowest realised volatility over the past quarter.',
            how: [
                'On the first trading day of each month computes each stock\'s 63-day realised volatility (annualised standard deviation of daily log returns).',
                'The 10 least volatile each get 9.9% of equity (99% ÷ 10); ties are broken alphabetically.',
                'A held stock that drops out of the ten is sold at the next session; kept ones are topped up or trimmed only past the 2% drift band.',
                'Stocks with fewer than 64 bars are not ranked.',
            ],
            why: [
                'The low-volatility anomaly: boring stocks have delivered similar or better returns than exciting ones with much less drawdown, contrary to the textbook risk-return trade-off.',
                'Leverage constraints and lottery-seeking push investors toward volatile names, leaving calm ones underpriced.',
            ],
            fails: [
                'It trails badly in strong bull markets and sharp rebounds, when the most volatile names lead.',
                'Sector concentration: the calm ten are often staples, utilities and health care, so it is a rates and sector bet in disguise.',
                'Volatility is backward-looking — a calm stock can become a volatile one the day after it is bought.',
            ],
            watching: 'Each stock\'s 63-day realised volatility and its rank from calmest to wildest.',
            beginnerLine: 'Own the stocks that do not make headlines.',
            cashReason: 'In cash — the first monthly ranking has not been traded yet; it fills on the next session once enough history is available.',
            caveats: [...COMMON_CAVEATS, SURVIVORSHIP_CAVEAT],
        },
    },
];

export const STRATEGY_SLUGS: readonly StrategyId[] = STRATEGIES.map((def) => def.id);

export const strategyBySlug = (slug: string): StrategyDefinition | undefined =>
    STRATEGIES.find((def) => def.id === slug);

// Engine semantics and the rule's own version both invalidate a stored backtest.
export const effectiveVersion = (def: StrategyDefinition): string => `${ENGINE_VERSION}.${def.version}`;
