// The market-making game: four hidden dice, and you make a market on their sum (4 to 24) over four
// rounds. Each round you quote a bid and an ask, three traders come by, and then one die is
// revealed; at the end the market settles at the true sum. Pure and client-safe. Everything random
// — the dice and what each trader believes — is drawn from the seed before the first quote, so a
// game replays exactly from its seed and its quotes, and the server scores a reported game by
// replaying it.
//
// One trader each round is informed: they know the sum to within one. The other two know only what
// has been revealed, plus noise. A trader buys at your ask when they think the sum is higher, and
// sells at your bid when they think it is lower — which is how a quote that is wrong about the
// sum gets traded against by the one who knows (adverse selection).

import {mulberry32} from "@/lib/random";

export const DICE = 4;
export const ROUNDS = 4;
export const SPREAD_MIN = 1;
export const SPREAD_MAX = 4;
export const POSITION_LIMIT = 10;
export const SUM_MIN = 4;
export const SUM_MAX = 24;
// How far the two uninformed traders' beliefs stray from the fair value (a standard deviation).
const NOISE_SD = 2.5;

export type Quote = {bid: number; ask: number};
export type TraderKind = 'informed' | 'noise';
export type Trade = {round: number; trader: number; kind: TraderKind; side: 'bought' | 'sold'; price: number};

export type Deal = {
    dice: number[];
    // [round][trader]: what each trader believes the sum is.
    beliefs: {kind: TraderKind; belief: number}[][];
};

const normal = (random: () => number): number => {
    // Box–Muller: one standard normal from two uniforms.
    const u = Math.max(random(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
};

// The dice revealed before round r, and the fair value then: what is shown plus 3.5 for each die
// still hidden.
export const revealedBefore = (dice: readonly number[], round: number): number[] => dice.slice(0, round);
export const fairValue = (dice: readonly number[], round: number): number =>
    revealedBefore(dice, round).reduce((sum, die) => sum + die, 0) + 3.5 * (DICE - round);

export const dealFor = (seed: number): Deal => {
    const random = mulberry32(seed);
    const dice = Array.from({length: DICE}, () => 1 + Math.floor(random() * 6));
    const sum = dice.reduce((a, b) => a + b, 0);
    const beliefs = Array.from({length: ROUNDS}, (_, round) => {
        // The informed trader's slot moves around so their place in the order says nothing.
        const informedAt = Math.floor(random() * 3);
        return Array.from({length: 3}, (_, trader) => (trader === informedAt
            ? {kind: 'informed' as const, belief: sum + [-1, 0, 1][Math.floor(random() * 3)]}
            : {kind: 'noise' as const, belief: fairValue(dice, round) + NOISE_SD * normal(random)}));
    });
    return {dice, beliefs};
};

export const isValidQuote = (quote: Quote): boolean =>
    Number.isInteger(quote.bid) && Number.isInteger(quote.ask)
    && quote.bid >= SUM_MIN - SPREAD_MAX && quote.ask <= SUM_MAX + SPREAD_MAX
    && quote.ask - quote.bid >= SPREAD_MIN && quote.ask - quote.bid <= SPREAD_MAX;

export type MarketState = {
    round: number;
    position: number;
    cash: number;
    trades: Trade[];
    done: boolean;
};

export const MARKET_START: MarketState = {round: 0, position: 0, cash: 0, trades: [], done: false};

// One round: each trader in turn trades one lot against the quote when it is on the wrong side of
// their belief, and no trade would take the position past the limit.
export const playRound = (state: MarketState, deal: Deal, quote: Quote): MarketState => {
    if (state.done || !isValidQuote(quote)) return state;
    let {position, cash} = state;
    const trades = [...state.trades];
    deal.beliefs[state.round].forEach(({kind, belief}, trader) => {
        if (belief > quote.ask && position - 1 >= -POSITION_LIMIT) {
            position -= 1;
            cash += quote.ask;
            trades.push({round: state.round, trader, kind, side: 'bought', price: quote.ask});
        } else if (belief < quote.bid && position + 1 <= POSITION_LIMIT) {
            position += 1;
            cash -= quote.bid;
            trades.push({round: state.round, trader, kind, side: 'sold', price: quote.bid});
        }
    });
    const round = state.round + 1;
    return {round, position, cash, trades, done: round >= ROUNDS};
};

// Profit and loss at the settlement: the cash from every trade plus the position at the true sum.
export const settlement = (state: MarketState, deal: Deal): number =>
    state.cash + state.position * deal.dice.reduce((a, b) => a + b, 0);

export const replayMarket = (seed: number, quotes: readonly Quote[]): {state: MarketState; pnl: number} => {
    const deal = dealFor(seed);
    let state = MARKET_START;
    for (const quote of quotes.slice(0, ROUNDS)) {
        if (!isValidQuote(quote)) break;
        state = playRound(state, deal, quote);
    }
    return {state, pnl: settlement(state, deal)};
};

// What your trades with each kind of trader made you at the settlement: selling at the ask makes
// ask − sum, buying at the bid makes sum − bid. The informed trader's share is usually the loss —
// adverse selection, in numbers.
export const pnlByKind = (state: MarketState, deal: Deal): Record<TraderKind, number> => {
    const sum = deal.dice.reduce((a, b) => a + b, 0);
    const out: Record<TraderKind, number> = {informed: 0, noise: 0};
    for (const trade of state.trades) out[trade.kind] += trade.side === 'bought' ? trade.price - sum : sum - trade.price;
    return out;
};
