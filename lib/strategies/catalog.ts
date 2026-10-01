// The quant strategies: data only (rules live in lib/strategies/rules), so client
// components can import names, explainers and board columns freely.
// Every sentence here is shown to readers as written — plain, accurate, no hype.
//
// Each rule's parameters are CATALOG_PARAMS, and every explainer sentence and board-column
// label that states one is built from them by buildStrategies, as are the cash floor and the
// drift band (lib/strategies/config). Three kinds of spelling stay literal, each held equal to
// the params by lib/strategies/__tests__/catalog-params.test.ts rather than built: the names
// ('Donchian 55/20 Breakout' is also the strategy account's name), the board's value keys
// ('high55', 'sma200' — the rules write them and stored runs carry them), and the glossary
// entries those keys point at (the glossary is imported here, so it cannot import back).

import {CASH_FLOOR, DEFAULT_DRIFT_BAND, ENGINE_VERSION, slotWeight} from '@/lib/strategies/config';
import type {StrategyDefinition, StrategyId} from '@/lib/strategies/types';
import {shortHelp} from '@/lib/learn/glossary';
import {numberWord} from '@/lib/text';

export const CATALOG_PARAMS = {
    'buy-and-hold-spy': {allocation: 0.99},
    'sixty-forty': {spyWeight: 0.6, aggWeight: 0.4},
    'golden-cross': {fast: 50, slow: 200},
    'dual-momentum': {lookback: 252},
    'momentum-12-1': {lookback: 252, skip: 21, top: 8},
    'rsi2-mean-reversion': {rsiPeriod: 2, entryRsi: 10, exitSma: 5, trendSma: 200},
    'donchian-breakout': {entryChannel: 55, exitChannel: 20},
    'low-volatility': {volWindow: 63, top: 10},
} as const satisfies Record<StrategyId, Readonly<Record<string, number>>>;

export type CatalogParams = {readonly [Id in keyof typeof CATALOG_PARAMS]: {readonly [Key in keyof (typeof CATALOG_PARAMS)[Id]]: number}};

// 0.12375 → 12.4, 0.09 → 9: one decimal, dropped when it is zero; pct adds the sign.
const percent = (fraction: number): number => Number((fraction * 100).toFixed(1));
const pct = (fraction: number): string => `${percent(fraction)}%`;
// A lookback in trading days as months: 252 → 12, 21 → 1.
const TRADING_DAYS_PER_MONTH = 21;
const months = (bars: number): number => Math.round(bars / TRADING_DAYS_PER_MONTH);

// Rendered once per strategy page, never twice. It used to appear at the foot of the
// detail page AND inside the reading guide, which is how a disclaimer stops being read.
export const STRATEGIES_DISCLAIMER = 'Deterministic rules · no AI · paper money · not financial advice';

const INVESTED = pct(1 - CASH_FLOOR);
const FLOOR = pct(CASH_FLOOR);
const BAND = pct(DEFAULT_DRIFT_BAND);
// What each of `slots` equal positions gets: '12.4% of equity (99% ÷ 8)'.
const slotShare = (slots: number): string => `${pct(slotWeight(slots))} of equity (${INVESTED} ÷ ${slots})`;

const COMMON_CAVEATS: readonly string[] = [
    'Orders fill at the next session, not at the close that produced the signal.',
    'Buys are sized from the previous close in whole shares; a gap-up can bounce an order until the next day.',
    'No fees and no slippage are charged. Like a brokerage account, idle cash earns the 13-week T-bill rate and holdings receive their dividends, as cash.',
];

const SURVIVORSHIP_CAVEAT =
    'The 40-name list was chosen in 2026 and applied to earlier years, so simulated results carry survivorship bias.';

const TOTAL_RETURN_CAVEAT =
    'Signals use total return (dividends included) because the T-bill hurdle is entirely yield; the account itself is also paid those dividends, as cash.';

const CLOSE_COLUMN = {key: 'close', label: 'Last close', format: 'price', glossary: 'close', help: shortHelp('close')} as const;

// The catalog for a set of parameters: CATALOG_PARAMS for the app, another set for a test
// that moves one and reads the prose follow it.
export const buildStrategies = (params: CatalogParams = CATALOG_PARAMS): readonly StrategyDefinition[] => {
    const hold = params['buy-and-hold-spy'];
    const mix = params['sixty-forty'];
    const cross = params['golden-cross'];
    const gem = params['dual-momentum'];
    const gemMonths = months(gem.lookback);
    const mom = params['momentum-12-1'];
    const momLabel = `${months(mom.lookback)}-${months(mom.skip)}`;
    const rsi = params['rsi2-mean-reversion'];
    const rsiLabel = `RSI(${rsi.rsiPeriod})`;
    const turtle = params['donchian-breakout'];
    const lowVol = params['low-volatility'];
    const SECTOR_SLOTS = 11;
    const RSI_SLOTS = 5;
    const TURTLE_SLOTS = 8;

    return [
    {
        id: 'buy-and-hold-spy',
        name: 'Buy & Hold SPY',
        family: 'Baseline',
        cadence: 'once',
        universe: 'spy',
        slots: 1,
        version: '1',
        params: hold,
        driftBand: DEFAULT_DRIFT_BAND,
        signalColumns: [
            CLOSE_COLUMN,
            {key: 'sinceEntry', label: 'Since entry', format: 'pct', glossary: 'since-entry', help: shortHelp('since-entry')},
        ],
        explainer: {
            summary: 'Buys the S&P 500 ETF on its first run and never trades again — the bar every other strategy has to clear.',
            how: [
                `On the first run, puts ${pct(hold.allocation)} of the account into SPY and keeps a ${FLOOR} cash floor.`,
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
            beginnerLine: 'Owns the index and does nothing else — the bar most professional managers trail.',
            cashReason: 'In cash — the first purchase has not happened yet; it fills on the next session with a fresh SPY bar.',
            caveats: [
                ...COMMON_CAVEATS,
                'Dividends arrive as cash, which earns T-bill interest, while the benchmark reinvests them in SPY — so even this can trail "SPY, total return" slightly in a rising market.',
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
        params: mix,
        driftBand: DEFAULT_DRIFT_BAND,
        signalColumns: [
            CLOSE_COLUMN,
            {key: 'weight', label: 'Current weight', format: 'pct', glossary: 'weight', help: shortHelp('weight')},
            {key: 'target', label: 'Target', format: 'pct', glossary: 'target', help: shortHelp('target')},
            {key: 'drift', label: 'Drift', format: 'pct', glossary: 'drift', help: shortHelp('drift')},
        ],
        explainer: {
            summary: `The classic balanced portfolio: ${pct(mix.spyWeight)} stocks (SPY), ${pct(mix.aggWeight)} bonds (AGG), put back to target every quarter.`,
            how: [
                `Targets ${pct(mix.spyWeight)} SPY and ${pct(mix.aggWeight)} AGG of the invested ${INVESTED}, which is ${pct(mix.spyWeight * (1 - CASH_FLOOR))} and ${pct(mix.aggWeight * (1 - CASH_FLOOR))} of equity.`,
                'On the first trading day of January, April, July and October it compares each leg with its target.',
                `A leg is traded only when it has drifted more than ${BAND} of equity from target; smaller drifts are left alone.`,
                'Between rebalances it does nothing, whatever the market does.',
            ],
            why: [
                'Diversification is about correlation, not count: stocks and high-grade bonds have usually moved differently, so the mix has a smoother path than either alone.',
                'Rebalancing mechanically sells what has run and buys what has lagged — a small, disciplined contrarian bet.',
            ],
            fails: [
                'When stocks and bonds fall together, as in 2022, there is nowhere to hide and the bond leg cushions nothing.',
                `In long bull markets the bond leg is a drag: ${percent(mix.spyWeight)}/${percent(mix.aggWeight)} lags an all-stock portfolio by design.`,
                'Quarterly rebalancing is slow; a crash and recovery inside one quarter is simply ridden out.',
            ],
            watching: 'Each leg\'s current weight, its target and the drift between them.',
            beginnerLine: 'Owns two things that do not move together and keeps putting them back in proportion.',
            cashReason: 'In cash — the first quarterly allocation has not been made yet; it fills on the next session when both SPY and AGG have fresh bars.',
            caveats: [
                ...COMMON_CAVEATS,
                `The ${FLOOR} cash floor makes the actual targets ${pct(mix.spyWeight * (1 - CASH_FLOOR))} and ${pct(mix.aggWeight * (1 - CASH_FLOOR))} of equity, and the reasons on this page quote those numbers.`,
            ],
        },
    },
    {
        id: 'golden-cross',
        name: 'Golden Cross Sectors',
        family: 'Trend following',
        cadence: 'daily',
        universe: 'sectors',
        slots: SECTOR_SLOTS,
        version: '1',
        params: cross,
        driftBand: DEFAULT_DRIFT_BAND,
        signalColumns: [
            CLOSE_COLUMN,
            {key: 'sma50', label: `SMA${cross.fast}`, format: 'price', glossary: 'sma50', help: shortHelp('sma50')},
            {key: 'sma200', label: `SMA${cross.slow}`, format: 'price', glossary: 'sma200', help: shortHelp('sma200')},
            {key: 'spread', label: `SMA${cross.fast} vs SMA${cross.slow}`, format: 'pct', glossary: 'spread', help: shortHelp('spread')},
            {key: 'trendOn', label: 'Trend on', format: 'bool', glossary: 'trend-on', help: shortHelp('trend-on')},
        ],
        explainer: {
            summary: `Holds each of the ${numberWord(SECTOR_SLOTS)} S&P sector ETFs while its ${cross.fast}-day average is above its ${cross.slow}-day average, and steps out when it is not.`,
            how: [
                `Every trading day computes the ${cross.fast}-day and ${cross.slow}-day simple moving averages of each sector ETF's close.`,
                `A sector is on while SMA${cross.fast} is strictly above SMA${cross.slow} (a golden cross) and off otherwise (a death cross).`,
                `Each sector that is on gets an equal slot of ${slotShare(SECTOR_SLOTS)}; a sector that turns off is sold in full at the next session.`,
                'On the first run it buys every sector already trending — it does not wait for fresh crosses.',
                `Held slots are not resized on small drift; only a move beyond the ${BAND} band triggers a top-up or trim.`,
            ],
            why: [
                'Trends persist more often than chance would suggest, partly because investors under-react to news and then pile in slowly.',
                'Sitting out death-cross regimes has historically skipped the worst stretches of bear markets, at the cost of missing the first leg of recoveries.',
            ],
            fails: [
                'Whipsaws: in a sideways market the averages cross and re-cross, and each round trip loses a little.',
                `It is late by design — a ${cross.slow}-day average confirms a trend months after it started and exits months after it ended.`,
                'A V-shaped crash and recovery (March 2020) sells near the bottom and buys back well above it.',
            ],
            watching: `Each sector's close, SMA${cross.fast}, SMA${cross.slow}, the spread between the averages and whether the trend is on.`,
            beginnerLine: 'Owns what is trending up, steps aside from what is trending down, and accepts being late both ways.',
            cashReason: `In cash — no sector ETF has its ${cross.fast}-day average above its ${cross.slow}-day average right now.`,
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
        params: gem,
        driftBand: DEFAULT_DRIFT_BAND,
        signalColumns: [
            CLOSE_COLUMN,
            {key: 'r12', label: `${gemMonths}m total return`, format: 'pct', glossary: 'r12', help: shortHelp('r12')},
            {key: 'aboveHurdle', label: 'Beats T-bills', format: 'bool', glossary: 'above-hurdle', help: shortHelp('above-hurdle')},
            {key: 'pick', label: 'Would be chosen', format: 'bool', glossary: 'pick', help: shortHelp('pick')},
        ],
        explainer: {
            summary: 'Gary Antonacci\'s Global Equities Momentum: each month hold US or international stocks if stocks beat T-bills over the past year, otherwise bonds.',
            how: [
                `On the first trading day of each month computes ${gemMonths}-month (${gem.lookback}-bar) total returns, dividends included, for SPY, EFA, AGG and BIL.`,
                `Absolute momentum: if SPY's ${gemMonths}-month return is above BIL's (the T-bill hurdle), stocks are on; otherwise the whole position goes to AGG.`,
                `Relative momentum: with stocks on, hold whichever of SPY and EFA has the higher ${gemMonths}-month return; a tie goes to SPY.`,
                `The chosen ETF gets ${INVESTED} of equity; whatever else is held is sold at the next session.`,
                'If a return cannot be computed or the chosen ETF has no fresh bar, the rebalance is deferred rather than executed on partial data.',
            ],
            why: [
                'Momentum (Jegadeesh and Titman) is one of the most persistent return anomalies: what led over the past year tends to keep leading for a few months.',
                'Absolute momentum steps aside when stocks are losing to cash, which has historically cut the depth of bear-market drawdowns.',
                'Comparing with T-bills rather than with zero means "stocks are up" is not enough — they have to beat the risk-free alternative.',
            ],
            fails: [
                `Monthly checks and a ${gemMonths}-month lookback mean it can hold stocks through the first months of a crash and switch to bonds near the bottom.`,
                'Sharp V-reversals whipsaw it: out after the fall, back in after the recovery.',
                'In 2022 bonds fell too, so the "safe" leg lost money as well.',
            ],
            watching: `The ${gemMonths}-month total return of each of the four ETFs, whether SPY clears the T-bill hurdle, and which ETF the rule would choose today.`,
            beginnerLine: 'Owns the past year\'s winner — unless the winner is cash, in which case it owns bonds.',
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
        slots: mom.top,
        version: '1',
        params: mom,
        driftBand: DEFAULT_DRIFT_BAND,
        signalColumns: [
            CLOSE_COLUMN,
            {key: 'momentum', label: `${momLabel} return`, format: 'pct', glossary: 'momentum-12-1', help: shortHelp('momentum-12-1')},
            {key: 'rank', label: 'Rank', format: 'rank', glossary: 'momentum-rank', help: shortHelp('momentum-rank')},
        ],
        explainer: {
            summary: `Each month buys the ${numberWord(mom.top)} large caps with the strongest return over the past twelve months, skipping the most recent month.`,
            how: [
                `On the first trading day of each month ranks the 40-stock universe by the return from ${mom.lookback} trading days ago to ${mom.skip} trading days ago (${momLabel} momentum).`,
                `The top ${mom.top} each get ${slotShare(mom.top)}; ties are broken alphabetically.`,
                `A held stock that falls out of the top ${mom.top} is sold at the next session; a kept one is topped up or trimmed only past the ${BAND} drift band.`,
                `Stocks with fewer than ${mom.lookback + 1} bars of history are not ranked.`,
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
                `High turnover — a monthly reshuffle of ${numberWord(mom.top)} names racks up trading costs the paper account does not charge.`,
            ],
            watching: `Each stock's ${momLabel} return and its rank in the universe.`,
            beginnerLine: 'Owns what has been going up for a year, ignores the last month, and reshuffles monthly.',
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
        slots: RSI_SLOTS,
        version: '1',
        params: rsi,
        driftBand: DEFAULT_DRIFT_BAND,
        signalColumns: [
            CLOSE_COLUMN,
            {key: 'rsi2', label: rsiLabel, format: 'number', glossary: 'rsi2', help: shortHelp('rsi2')},
            {key: 'sma5', label: `SMA${rsi.exitSma}`, format: 'price', glossary: 'sma5', help: shortHelp('sma5')},
            {key: 'sma200', label: `SMA${rsi.trendSma}`, format: 'price', glossary: 'sma200', help: shortHelp('sma200')},
            {key: 'aboveSma200', label: `Above SMA${rsi.trendSma}`, format: 'bool', glossary: 'above-sma200', help: shortHelp('above-sma200')},
        ],
        explainer: {
            summary: `Larry Connors' RSI-${rsi.rsiPeriod}: buy large caps in an uptrend after a sharp ${numberWord(rsi.rsiPeriod)}-day dip and sell them on the first bounce above the ${rsi.exitSma}-day average.`,
            how: [
                `Every trading day computes the ${rsi.rsiPeriod}-period RSI, the ${rsi.exitSma}-day and the ${rsi.trendSma}-day simple moving averages of each stock in the 40-name universe.`,
                `Entry: not held, close above SMA${rsi.trendSma} (long-term uptrend) and ${rsiLabel} below ${rsi.entryRsi} (oversold); candidates are ranked by RSI, lowest first.`,
                `Exit: held and close above SMA${rsi.exitSma}; exits are decided before entries on the same day.`,
                `Up to ${RSI_SLOTS} positions of ${pct(slotWeight(RSI_SLOTS))} of equity each (${INVESTED} ÷ ${RSI_SLOTS}); open slots are filled by the lowest-RSI candidates.`,
                'A stock sold today is not bought back the same day, and held positions are never resized.',
            ],
            why: [
                'Over one to five days, sharp drops in strong stocks tend to bounce (short-term over-reaction) — the mirror image of medium-term momentum.',
                `Requiring the ${rsi.trendSma}-day trend filters out stocks that are dropping because something is actually wrong.`,
                'Holding periods are days, so the strategy spends much of its time in cash and sidesteps long declines.',
            ],
            fails: [
                `Catching falling knives: a ${numberWord(rsi.rsiPeriod)}-day drop that keeps falling — the exit rule waits for a bounce that may come much lower.`,
                `In a bear market almost nothing is above its SMA${rsi.trendSma}, so the strategy sits in cash while a rally starts without it.`,
                'Many small trades: the paper account ignores the slippage and commissions that would erode a real version.',
            ],
            watching: `Each stock's ${rsiLabel}, close, SMA${rsi.exitSma} and SMA${rsi.trendSma}, and whether it is above its long-term average.`,
            beginnerLine: `Buys a strong stock on a ${numberWord(rsi.rsiPeriod)}-day dip and sells the bounce.`,
            cashReason: `In cash — no large cap in an uptrend is oversold (${rsiLabel} below ${rsi.entryRsi}) right now.`,
            caveats: [...COMMON_CAVEATS, SURVIVORSHIP_CAVEAT],
        },
    },
    {
        id: 'donchian-breakout',
        name: 'Donchian 55/20 Breakout',
        family: 'Breakout',
        cadence: 'daily',
        universe: 'largecaps',
        slots: TURTLE_SLOTS,
        version: '1',
        params: turtle,
        driftBand: DEFAULT_DRIFT_BAND,
        signalColumns: [
            CLOSE_COLUMN,
            {key: 'high55', label: `${turtle.entryChannel}-day high`, format: 'price', glossary: 'high55', help: shortHelp('high55')},
            {key: 'low20', label: `${turtle.exitChannel}-day low`, format: 'price', glossary: 'low20', help: shortHelp('low20')},
            {key: 'vsHigh', label: `vs ${turtle.entryChannel}-day high`, format: 'pct', glossary: 'vs-high', help: shortHelp('vs-high')},
        ],
        explainer: {
            summary: `The Turtle traders' channel rule: buy a large cap when it closes above its ${turtle.entryChannel}-day high, sell when it closes below its ${turtle.exitChannel}-day low.`,
            how: [
                `Every trading day computes each stock's highest high of the prior ${turtle.entryChannel} bars and lowest low of the prior ${turtle.exitChannel} bars, today's bar excluded.`,
                `Entry: not held and today's close strictly above the ${turtle.entryChannel}-day high; candidates are ranked by how far above the channel they closed.`,
                `Exit: held and today's close strictly below the ${turtle.exitChannel}-day low; exits are decided before entries.`,
                `Up to ${TURTLE_SLOTS} positions of ${pct(slotWeight(TURTLE_SLOTS))} of equity each (${INVESTED} ÷ ${TURTLE_SLOTS}); held positions are never resized.`,
                `A stock needs ${turtle.entryChannel + 1} bars with highs and lows; without them it is not traded, and a held one is kept.`,
            ],
            why: [
                `A new ${turtle.entryChannel}-day high is information: every holder is in profit and there is no overhead supply of trapped sellers.`,
                'Trend followers profit from the fat right tail — a few large winners pay for many small losses.',
                `The wide exit (${turtle.exitChannel}-day low) gives a trend room to breathe instead of shaking the position out on noise.`,
            ],
            fails: [
                'Sideways chop: repeated false breakouts that reverse into the exit produce a string of small losses.',
                'It is late by design — entries come after a move is under way and exits give back a chunk of the gain.',
                `A gap down through the ${turtle.exitChannel}-day low fills far below the trigger.`,
            ],
            watching: `Each stock's close, ${turtle.entryChannel}-day high, ${turtle.exitChannel}-day low and distance from the entry channel.`,
            beginnerLine: 'Buys new highs, sells new lows, and lets the winners run.',
            cashReason: `In cash — no large cap has closed above its ${turtle.entryChannel}-day high right now.`,
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
        slots: lowVol.top,
        version: '1',
        params: lowVol,
        driftBand: DEFAULT_DRIFT_BAND,
        signalColumns: [
            CLOSE_COLUMN,
            {key: 'vol63', label: `${lowVol.volWindow}-day vol`, format: 'pct', glossary: 'vol63', help: shortHelp('vol63')},
            {key: 'rank', label: 'Rank', format: 'rank', glossary: 'vol-rank', help: shortHelp('vol-rank')},
        ],
        explainer: {
            summary: `Each month holds the ${numberWord(lowVol.top)} large caps with the lowest realised volatility over the past quarter.`,
            how: [
                `On the first trading day of each month computes each stock's ${lowVol.volWindow}-day realised volatility (annualised standard deviation of daily log returns).`,
                `The ${lowVol.top} least volatile each get ${slotShare(lowVol.top)}; ties are broken alphabetically.`,
                `A held stock that drops out of the ${numberWord(lowVol.top)} is sold at the next session; kept ones are topped up or trimmed only past the ${BAND} drift band.`,
                `Stocks with fewer than ${lowVol.volWindow + 1} bars are not ranked.`,
            ],
            why: [
                'The low-volatility anomaly: boring stocks have delivered similar or better returns than exciting ones with much less drawdown, contrary to the textbook risk-return trade-off.',
                'Leverage constraints and lottery-seeking push investors toward volatile names, leaving calm ones with less demand than their record would suggest.',
            ],
            fails: [
                'It trails badly in strong bull markets and sharp rebounds, when the most volatile names lead.',
                `Sector concentration: the calm ${numberWord(lowVol.top)} are often staples, utilities and health care, so it is a rates and sector bet in disguise.`,
                'Volatility is backward-looking — a calm stock can become a volatile one the day after it is bought.',
            ],
            watching: `Each stock's ${lowVol.volWindow}-day realised volatility and its rank from calmest to wildest.`,
            beginnerLine: 'Owns the stocks that do not make headlines.',
            cashReason: 'In cash — the first monthly ranking has not been traded yet; it fills on the next session once enough history is available.',
            caveats: [...COMMON_CAVEATS, SURVIVORSHIP_CAVEAT],
        },
    },
    ];
};

export const STRATEGIES: readonly StrategyDefinition[] = buildStrategies();

export const STRATEGY_SLUGS: readonly StrategyId[] = STRATEGIES.map((def) => def.id);

export const strategyBySlug = (slug: string): StrategyDefinition | undefined =>
    STRATEGIES.find((def) => def.id === slug);

// Engine semantics and the rule's own version both invalidate a stored backtest.
export const effectiveVersion = (def: StrategyDefinition): string => `${ENGINE_VERSION}.${def.version}`;
