// Copy for "Read this board" (lib/strategies/learn/board-narration.ts): the top row of a strategy's
// signal board read in plain words — what its numbers say, then the verdict they led to —
// and one line per strategy on how every other row reads. Sentences describe what the
// rule looks at and what it did; none says what a reader ought to do, and the test holds
// every one to the 'copy' tier of lib/learn/banned.ts. Pure: values arrive already
// formatted the way the board prints them, so a sentence can never disagree with its cell.

export type RankOrder = 'strongest' | 'calmest';

export const BOARD_COPY = {
    // The one disclosure beside the board, which also carries its definitions.
    summary: (symbol: string): string => `Read this board — ${symbol}`,
    // Shown in place of the reading while Guess the Verdict is open: it would give the answers away.
    paused: 'The reading of the top row is hidden while the quiz is open, so it cannot give the answers away.',
    genericKey: 'Each row is one symbol the rule scores every morning; the verdict is what it decided from those numbers.',

    // ---- When the row does not carry the rule's numbers ------------------------------
    numbersMissing: (symbol: string): string =>
        `The board does not have every number this rule reads for ${symbol}, so only its verdict can be read.`,
    verdictOnly: (symbol: string, label: string, meaning: string): string => `The verdict for ${symbol} is ${label}. ${meaning}`,
    boardVerdict: (symbol: string, label: string): string => `The board's verdict for ${symbol} is ${label}.`,

    // ---- Buy & Hold SPY ----------------------------------------------------------------
    bhClose: (symbol: string, close: string): string => `${symbol} closed at ${close}.`,
    bhSinceEntry: (symbol: string, change: string): string =>
        `Since entry reads ${change}: the close against the average price the rule paid for ${symbol}, dividends not counted.`,
    bhHeld: (symbol: string): string =>
        `The rule bought ${symbol} once and never trades it again, so the verdict stays held whatever these numbers do.`,
    bhEnter: (symbol: string, invested: string): string =>
        `Nothing is owned yet, so the verdict is enter: the one purchase the rule ever makes, ${invested} of the account into ${symbol} at the next session.`,
    bhWatch: (symbol: string): string => `${symbol} is not owned and its one purchase is not due today, so the verdict is watch.`,
    bhKey: (): string =>
        'The board has one row. After the first purchase its verdict stays held, and the numbers beside it only track the price.',

    // ---- 60/40 -------------------------------------------------------------------------
    legWeight: (symbol: string, weight: string, target: string, drift: string): string =>
        `${symbol} makes up ${weight} of the account against a target of ${target}, a drift of ${drift}.`,
    legUnpriced: (symbol: string, target: string): string =>
        `${symbol}'s share of the account cannot be measured at this close, so its drift is unknown; its target is ${target}.`,
    legInsideBand: (band: string): string =>
        `That drift is inside the ${band} band, so even at a quarterly rebalance this leg is left alone.`,
    legOutsideBand: (band: string): string =>
        `That drift is wider than the ${band} band, so at a quarterly rebalance this leg is traded back toward its target.`,
    legHeld: (symbol: string): string =>
        `The rule owns ${symbol}, so the verdict is held; it trades only on the first fresh run of each quarter.`,
    legEnter: (symbol: string): string =>
        `${symbol} is not owned yet, so the verdict is enter: the quarterly allocation brings it up to its target at the next session.`,
    legWatch: (symbol: string): string =>
        `${symbol} is not owned yet and is bought on the first fresh run of a quarter, so until then the verdict is watch.`,
    sixtyFortyKey: (targets: {spy: string; agg: string} | null, band: string): string =>
        `Each leg reads the same way: Drift is the current weight minus the target${targets ? ` (${targets.spy} for SPY, ${targets.agg} for AGG)` : ''}, and only a drift wider than ${band} of the account is traded, on the first fresh run of each quarter.`,

    // ---- Golden cross ------------------------------------------------------------------
    crossOn: (symbol: string, fast: string, fastValue: string, slow: string, slowValue: string): string =>
        `${symbol}'s ${fast} average (${fastValue}) is above its ${slow} average (${slowValue}), so Trend on reads yes.`,
    crossOff: (symbol: string, fast: string, fastValue: string, slow: string, slowValue: string): string =>
        `${symbol}'s ${fast} average (${fastValue}) is at or below its ${slow} average (${slowValue}), so Trend on reads no.`,
    crossSpread: (magnitude: string, above: boolean): string =>
        `The faster average sits ${magnitude} ${above ? 'above' : 'below'} the slower one.`,
    crossLevel: (): string => 'The two averages are level.',
    crossEnter: (symbol: string, slots: number): string =>
        `The rule did not own ${symbol}, so the verdict is enter: it buys one of its ${slots} equal slots at the next session.`,
    crossHeld: (symbol: string): string => `The rule already owns ${symbol} and the uptrend still holds, so the verdict is held.`,
    crossExit: (symbol: string): string =>
        `The rule owns ${symbol} but the uptrend is gone, so the verdict is exit: the whole position is sold at the next session.`,
    crossWatch: (symbol: string): string => `${symbol} is not owned and has no uptrend, so the verdict is watch.`,
    crossKey: (fast: string, slow: string): string =>
        `Every row reads the same way: while the ${fast} average is above the ${slow} average a sector is held or entered, and once it is not, a held sector is exited and the rest stay on watch.`,

    // ---- Dual momentum -----------------------------------------------------------------
    gemReturn: (symbol: string, ret: string, sessions: string): string =>
        `${symbol}'s total return over the last ${sessions} sessions, dividends included, is ${ret}.`,
    gemNoReturn: (symbol: string, sessions: string): string =>
        `${symbol}'s total return over the last ${sessions} sessions cannot be computed yet: there is not that much price history.`,
    gemSpyOn: (): string => 'That is above the T-bill return, so absolute momentum reads on: at a monthly check the rule holds stocks.',
    gemSpyOff: (bonds: string): string =>
        `That is not above the T-bill return, so absolute momentum reads off: at a monthly check the rule holds bonds (${bonds}).`,
    gemHurdle: (symbol: string): string =>
        `${symbol} holds Treasury bills: its return is the hurdle the stock funds are measured against, not a fund the rule picks.`,
    gemPicked: (symbol: string): string => `Would be chosen reads yes: ${symbol} is the one fund the monthly check picks today.`,
    gemNotPicked: (): string => 'Would be chosen reads no: the monthly check picks a different fund today.',
    gemEnter: (symbol: string, invested: string): string =>
        `The rule did not own ${symbol}, so the verdict is enter: ${invested} of the account goes into it at the next session.`,
    gemHeld: (symbol: string): string => `The rule owns ${symbol}, so the verdict is held; it switches funds only at a monthly check.`,
    gemExit: (symbol: string): string =>
        `The rule owned ${symbol}, but the monthly check picked another fund, so the verdict is exit: it is sold at the next session.`,
    gemWatch: (symbol: string): string =>
        `${symbol} is not owned; the rule holds one fund at a time and switches only at a monthly check, so the verdict is watch.`,
    gemKey: (): string =>
        'Only one row can read yes under Would be chosen: that is the fund the rule holds after a monthly check, and every other fund is sold or stays on watch.',

    // ---- Ranked reshuffles (12-1 momentum, low volatility) -------------------------------
    momentumReading: (symbol: string, ret: string, lookback: string, skip: string): string =>
        `${symbol}'s price change from ${lookback} sessions ago to ${skip} sessions ago is ${ret}: the past year with the latest month left out.`,
    lowVolReading: (symbol: string, days: string, vol: string): string =>
        `${symbol}'s daily price swings over the last ${days} sessions annualise to ${vol} volatility.`,
    rankPosition: (position: string, total: string | null, order: RankOrder): string =>
        `That ranks #${position}${total ? ` of ${total}` : ''}${order === 'strongest' ? ', where #1 is the strongest' : ', counting from the calmest'}.`,
    rankedEnter: (symbol: string, slots: number): string =>
        `At the monthly reshuffle ${symbol} ranked inside the top ${slots} while not owned, so the verdict is enter: one of ${slots} equal slots at the next session.`,
    rankedHeldInside: (symbol: string, slots: number): string =>
        `The rule owns ${symbol} and it ranks inside the top ${slots}, so the verdict is held.`,
    rankedHeldOutside: (symbol: string, slots: number): string =>
        `The rule owns ${symbol}; it now ranks outside the top ${slots}, but trades happen only at the monthly reshuffle, so until then the verdict is held.`,
    rankedExit: (symbol: string, slots: number): string =>
        `At the monthly reshuffle ${symbol} ranked outside the top ${slots}, so the verdict is exit: it is sold at the next session.`,
    rankedWatchInside: (symbol: string, slots: number): string =>
        `${symbol} ranks inside the top ${slots} but is not owned; the rule adds names only at the monthly reshuffle, so until then the verdict is watch.`,
    rankedWatchOutside: (symbol: string, slots: number): string =>
        `${symbol} ranks outside the top ${slots} and is not owned, so the verdict is watch.`,
    momentumKey: (slots: number): string =>
        `The Rank column is the whole rule: at each monthly reshuffle ranks #1 to #${slots} are owned and every other name is not; between reshuffles the ranking moves but nothing trades.`,
    lowVolKey: (slots: number): string =>
        `The Rank column is the whole rule: at each monthly reshuffle the ${slots} calmest names, ranks #1 to #${slots}, are owned and every other name is not; between reshuffles the ranking moves but nothing trades.`,

    // ---- RSI-2 mean reversion ----------------------------------------------------------
    rsiDip: (symbol: string, period: string, value: string, level: string): string =>
        `${symbol}'s ${period}-day RSI reads ${value}, under the entry level of ${level}: a sharp, short dip.`,
    rsiNoDip: (symbol: string, period: string, value: string, level: string): string =>
        `${symbol}'s ${period}-day RSI reads ${value}, not under the entry level of ${level}, so there is no dip to act on.`,
    rsiTrendUp: (close: string, length: string, average: string): string =>
        `Its close (${close}) is above the ${length}-day average (${average}), so the long-term trend is up.`,
    rsiTrendDown: (close: string, length: string, average: string): string =>
        `Its close (${close}) is at or below the ${length}-day average (${average}), so the trend filter rules it out.`,
    rsiEnter: (slots: number, exitLength: string): string =>
        `Both entry conditions hold and a slot was open, so the verdict is enter: one of ${slots} equal slots, sold on the first close above the ${exitLength}-day average.`,
    rsiNoSlot: (slots: number): string =>
        `Both entry conditions hold, but all ${slots} slots are taken, so the verdict is watch; the lowest readings get the slots first.`,
    rsiWatch: (): string => 'An entry needs both conditions at once, so the verdict is watch.',
    rsiHeld: (symbol: string, close: string, length: string, average: string): string =>
        `The rule owns ${symbol} and sells on the first close above the ${length}-day average; the close (${close}) is not above the ${length}-day average (${average}), so the verdict is held.`,
    rsiExit: (symbol: string, close: string, length: string, average: string): string =>
        `The rule owns ${symbol} and the close (${close}) rose above the ${length}-day average (${average}), its exit signal, so the verdict is exit: the whole position is sold at the next session.`,
    rsiKey: (period: string, level: string, trendLength: string, exitLength: string): string =>
        `A row enters when its ${period}-day RSI is under ${level} and its close is above the ${trendLength}-day average; a held row leaves on the first close above the ${exitLength}-day average.`,

    // ---- Donchian breakout -------------------------------------------------------------
    breakout: (symbol: string, close: string, days: string, high: string, size: string): string =>
        `${symbol} closed at ${close}, above the highest high of the previous ${days} sessions (${high}), by ${size}: a breakout.`,
    noBreakout: (symbol: string, close: string, days: string, high: string): string =>
        `${symbol} closed at ${close}, not above the highest high of the previous ${days} sessions (${high}), so there is no breakout.`,
    breakoutEnter: (slots: number, exitDays: string): string =>
        `A slot was open, so the verdict is enter: one of ${slots} equal slots, kept until a close under the ${exitDays}-day low.`,
    breakoutNoSlot: (slots: number): string =>
        `But all ${slots} slots are taken, so the verdict is watch; the largest breakouts get the slots first.`,
    breakoutWatch: (): string => 'Without a breakout there is no entry, so the verdict is watch.',
    channelHeld: (symbol: string, close: string, days: string, low: string): string =>
        `The rule owns ${symbol} and sells on a close under the lowest low of the previous ${days} sessions (${low}); the close (${close}) is not under it, so the verdict is held.`,
    channelExit: (symbol: string, close: string, days: string, low: string): string =>
        `The rule owns ${symbol} and the close (${close}) fell under the lowest low of the previous ${days} sessions (${low}), so the verdict is exit: the whole position is sold at the next session.`,
    breakoutKey: (entryDays: string, exitDays: string): string =>
        `A row enters when its close tops the highest high of the previous ${entryDays} sessions, and a held row leaves when a close drops under the lowest low of the previous ${exitDays}.`,
};
