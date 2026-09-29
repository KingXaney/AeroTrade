// Copy for the reason decoder (lib/learn/reasons.ts): the plain-English reading of every
// clause a strategy's reason string can contain. A gloss narrates what the rule did and
// why, in the rule's own numbers — "so the rule sold the whole position" — and never says
// what a reader ought to do, so the test holds each one to the 'advice' tier of
// lib/learn/banned.ts (narration verbs are allowed there; see its header). Pure: values
// in, sentences out. Numbers arrive already formatted as the reason printed them, so a
// gloss can never disagree with the string it explains.

// 0.99 → "99%", 0.594 → "59.4%": a rail or a catalog weight, as a share of the account.
export const shareText = (fraction: number): string => `${Number((fraction * 100).toFixed(1))}%`;

export type LegSplit = {share: string; invested: string; floor: string};

export const REASON_GLOSS = {
    // ---- Buy & Hold SPY ----------------------------------------------------------------
    initialDeployment: (symbol: string, invested: string, floor: string): string =>
        `The one purchase the rule makes: ${invested} of the account into ${symbol}, with a ${floor} cash floor kept back.`,
    holdForever: (symbol: string): string =>
        `After it the rule never sells, rebalances or adds to ${symbol}; it is the baseline the other strategies are compared with.`,

    // ---- 60/40 -------------------------------------------------------------------------
    legEnter: (symbol: string): string => `${symbol} was not owned yet, so this was the leg's first purchase.`,
    legRebalance: (band: string): string =>
        `The first fresh run of a new quarter: each leg is compared with its target, and only a leg more than ${band} of the account away from it is traded.`,
    legWeight: (symbol: string, weight: string): string => `${symbol} made up ${weight} of the account's value at the close.`,
    legUnpriced: (symbol: string): string =>
        `${symbol} had no usable value at the close, so its current share of the account could not be measured.`,
    legTarget: (target: string, split: LegSplit | null): string => (split
        ? `The target is ${target} of the account: ${split.share} of the ${split.invested} the rule invests after its ${split.floor} cash floor.`
        : `The target is ${target} of the account.`),

    // ---- Golden cross ------------------------------------------------------------------
    trendEnter: (slots: number): string =>
        `The trend condition held and the rule did not own this sector, so it bought one of its ${slots} equal slots.`,
    trendHold: (band: string): string =>
        `The trend condition still held, so the rule kept the position; it resizes a slot only when the slot drifts more than ${band} of the account from its target.`,
    trendExit: (): string => 'The trend condition no longer held, so the rule sold the whole position.',
    trendOn: (fast: string, fastValue: string, slow: string, slowValue: string): string =>
        `The ${fast}-day average (${fastValue}) was above the ${slow}-day average (${slowValue}): the rule's definition of an uptrend.`,
    trendOff: (fast: string, fastValue: string, slow: string, slowValue: string): string =>
        `The ${fast}-day average (${fastValue}) was at or below the ${slow}-day average (${slowValue}), which the rule reads as no uptrend.`,
    spread: (magnitude: string, above: boolean): string =>
        `The faster average sat ${magnitude} ${above ? 'above' : 'below'} the slower one.`,

    // ---- Dual momentum -----------------------------------------------------------------
    gemCheck: (sessions: number | null): string => (sessions === null
        ? 'The monthly check compares twelve-month total returns, dividends included, and holds one asset at a time.'
        : `The monthly check compares total returns over the last ${sessions} sessions (about twelve months), dividends included, and holds one asset at a time.`),
    gemStocksOn: (symbol: string, ret: string, bill: string): string =>
        `${symbol} returned ${ret} with dividends, more than T-bills' ${bill}: absolute momentum was on, so the rule holds stocks.`,
    gemStocksOff: (symbol: string, ret: string, bill: string): string =>
        `${symbol} returned ${ret} with dividends, no more than T-bills' ${bill}: absolute momentum was off, so the rule holds bonds instead of stocks.`,
    gemHome: (symbol: string, other: string, otherRet: string): string =>
        `${symbol} returned at least as much as ${other}, the international fund (${otherRet}), so US stocks were the stronger of the two.`,
    gemAbroad: (symbol: string, other: string, otherRet: string): string =>
        `${other}, the international fund, returned ${otherRet}, more than ${symbol}, so the rule picked international stocks.`,
    gemPick: (pick: string): string => `The pick: ${pick}, the one asset the rule holds until the next monthly check.`,
    gemBonds: (pick: string): string => `The pick: ${pick}, the bond fund, which the rule holds while stocks trail T-bills.`,
    gemRotate: (pick: string): string => `The monthly check picked ${pick}, so the rule sold this holding to own that single asset.`,

    // ---- Ranked reshuffles (12-1 momentum, low volatility) -------------------------------
    rankedEnter: (slots: number): string =>
        `The monthly reshuffle: the rule owns the top ${slots} of its ranking, and this name made the cut while not owned, so it bought one slot.`,
    rankedHold: (slots: number): string =>
        `The monthly reshuffle: this name was already owned and still ranked inside the top ${slots}, so the rule kept it.`,
    momentumRank: (position: string, total: string): string =>
        `It ranked #${position} of ${total} by 12-1 return, where #1 is the strongest.`,
    momentumReturn: (ret: string, window: {lookback: number; skip: number} | null): string => (window
        ? `Its price change from ${window.lookback} sessions ago to ${window.skip} sessions ago was ${ret}: the past year with the latest month left out.`
        : `Its price change over the past year, with the latest month left out, was ${ret}.`),
    momentumExit: (position: string, total: string, ret: string, slots: number): string =>
        `The monthly reshuffle ranked it #${position} of ${total} by 12-1 return (${ret}), outside the top ${slots}, so the rule sold it.`,
    lowVolReading: (days: string, vol: string): string =>
        `Over the last ${days} sessions its daily price swings annualise to ${vol} volatility.`,
    lowVolRank: (position: string, total: string): string => `That ranked #${position} of ${total}, counting from the calmest.`,
    lowVolExit: (position: string, total: string, vol: string, slots: number): string =>
        `The monthly reshuffle ranked it #${position} of ${total} by volatility (${vol}), outside the ${slots} calmest, so the rule sold it.`,

    // ---- RSI-2 mean reversion ----------------------------------------------------------
    rsiEnter: (slots: number, exitLength: number | null): string => (exitLength === null
        ? `Both entry conditions held and a slot was open, so the rule bought one of its ${slots} equal slots.`
        : `Both entry conditions held and a slot was open, so the rule bought one of its ${slots} equal slots; it sells on the first close above the ${exitLength}-day average.`),
    rsiReading: (period: string, value: string, level: string): string =>
        `The ${period}-day RSI read ${value}, under the entry level of ${level}: a sharp, short dip.`,
    rsiTrend: (close: string, length: string, average: string): string =>
        `The close (${close}) was above the ${length}-day average (${average}), so the long-term trend was still up: the filter that limits the rule to dips in uptrending stocks.`,
    rsiExit: (): string => 'The bounce the rule waits for arrived, so it sold the whole position.',
    rsiExitSignal: (close: string, length: string, average: string): string =>
        `The close (${close}) rose above the ${length}-day average (${average}): the rule's exit signal.`,

    // ---- Donchian breakout -------------------------------------------------------------
    breakoutEnter: (slots: number, exitDays: number | null): string => (exitDays === null
        ? `A breakout with a slot open, so the rule bought one of its ${slots} equal slots.`
        : `A breakout with a slot open, so the rule bought one of its ${slots} equal slots; it leaves on a close under the ${exitDays}-day low.`),
    breakoutLevel: (close: string, days: string, high: string): string =>
        `The close (${close}) was above the highest high of the previous ${days} sessions (${high}): a price the stock had not traded at recently.`,
    breakoutSize: (size: string): string =>
        `It closed ${size} above that high; when there are more breakouts than open slots, the largest take the slots first.`,
    breakoutExit: (): string => 'The close fell through the exit edge of the channel, so the rule sold the whole position.',
    breakoutExitLevel: (close: string, days: string, low: string): string =>
        `The close (${close}) was under the lowest low of the previous ${days} sessions (${low}).`,

    // ---- planOrders: resizing a held position ------------------------------------------
    rebalanceBand: (band: string): string =>
        `The holding had moved more than ${band} of the account away from its target, the band beyond which the rule trades; smaller drifts are left alone.`,
    rebalanceUnder: (drift: string): string => `It sat ${drift} of the account under its target, so the rule bought shares to close the gap.`,
    rebalanceOver: (drift: string): string => `It sat ${drift} of the account over its target, so the rule sold shares to close the gap.`,
    rebalanceTarget: (target: string): string => `The target is ${target} of the account.`,

    // ---- The engine ----------------------------------------------------------------------
    leftStrategyUniverse: (): string =>
        'The symbol is no longer on the strategy\'s list (a new version changed the list), so the engine sold a holding the rule no longer looks at.',
    staleDay: (count: string, total: string, limit: string): string =>
        `${count} of ${total} symbols had no fresh bar, more than the ${limit} the engine tolerates, so the whole day was skipped rather than decided on partial data.`,

    // ---- planOrders: orders it did not place ---------------------------------------------
    cashFloor: (floor: string): string =>
        `Buying even one share would have taken cash below the ${floor} floor every strategy keeps, so the buy was skipped.`,
    belowOneShare: (): string =>
        'The amount to trade came to less than one whole share, and orders are whole shares only, so nothing was placed.',
    staleOrder: (): string =>
        'There was no price bar for this symbol on the decision date, and nothing trades on an old price, so the order waits for a fresh bar.',
    unpricedOrder: (): string => 'There was no price to size the order with, so it was skipped.',
    duplicateTarget: (): string => 'The rule named this symbol twice; the last instruction was used.',

    // ---- Board notes ---------------------------------------------------------------------
    staleNote: (date: string): string =>
        `There was no price bar for ${date}, the close the rule decides on, so the symbol sat out.`,
    leftUniverseNote: (): string => 'Still held, but no longer on the strategy\'s list, so the engine sells it.',
    noOpenSlot: (slots: number | null): string => (slots === null
        ? 'The entry condition was true, but every slot was taken; the strongest signals get the slots first.'
        : `The entry condition was true, but all ${slots} slots were taken; the strongest signals get the slots first.`),
    needsBars: (bars: string, highsLows: boolean): string =>
        `Not enough price history yet: the rule's slowest indicator needs ${bars} daily bars${highsLows ? ' that carry highs and lows' : ''}.`,

    // ---- Data issues ---------------------------------------------------------------------
    heldButKept: (symbol: string): string =>
        `The rule owns ${symbol} but could not evaluate it today, so it kept the position rather than trade on missing numbers.`,
    purchaseDeferred: (symbol: string): string =>
        `The first purchase of ${symbol} waits for a fresh bar rather than use an old price.`,
    rebalanceDeferred: (quarterly: boolean): string => (quarterly
        ? 'The quarterly rebalance waits until every leg has a fresh bar; trading one leg against an old price would get the weights wrong.'
        : 'The monthly switch waits for a fresh bar on its pick rather than trade on an old price.'),
    returnUnavailable: (first: string, second: string, sessions: string): string =>
        `The ${sessions}-session total return of ${first} or ${second} could not be computed yet, so the monthly switch waits.`,
    hurdleMissing: (symbol: string): string =>
        `There was no ${symbol} history to set the T-bill hurdle, so the rule compared against zero instead.`,
};
