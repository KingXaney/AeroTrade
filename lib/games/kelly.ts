// The Kelly coin game, after Haghani and Dewey's 2016 experiment: a coin that lands heads 60% of the
// time, $25 to start, winnings capped at $250, at most 300 flips, and any bet you like each flip.
// Pure and client-safe. The flips come from the seed alone, so a game replays exactly from its
// seed and its bets — which is how the server scores a reported game.
//
// Beside your own bankroll the game runs three fixed rules on the same flips: the Kelly fraction
// (bet 2p − 1 = 20% of the bankroll on heads each flip), half of it, and everything on heads.

import {mulberry32} from "@/lib/random";

export const HEADS_PROBABILITY = 0.6;
export const START_CENTS = 2_500;
export const CAP_CENTS = 25_000;
export const MAX_FLIPS = 300;
export const KELLY_FRACTION = 2 * HEADS_PROBABILITY - 1;

export type Side = 'heads' | 'tails';
export type Bet = {side: Side; cents: number};

// The game's flips, true for heads: the same seed gives the same coin.
export const flipsFor = (seed: number, count = MAX_FLIPS): boolean[] => {
    const random = mulberry32(seed);
    return Array.from({length: count}, () => random() < HEADS_PROBABILITY);
};

export type KellyState = {
    bankroll: number;
    flips: number;
    // Every bankroll after each flip, starting with the opening $25.
    path: number[];
    ended: 'bust' | 'cap' | 'flips' | null;
};

export const KELLY_START: KellyState = {bankroll: START_CENTS, flips: 0, path: [START_CENTS], ended: null};

// A bet the game accepts: whole cents, at least one, at most what is left.
export const isValidBet = (state: KellyState, bet: Bet): boolean =>
    state.ended === null && Number.isInteger(bet.cents) && bet.cents >= 1 && bet.cents <= state.bankroll && (bet.side === 'heads' || bet.side === 'tails');

// One flip: the bet wins or loses its stake at even money; the game ends at zero, at the cap
// (winnings stop there, as in the experiment) or after the last flip.
export const playFlip = (state: KellyState, bet: Bet, heads: boolean): KellyState => {
    if (!isValidBet(state, bet)) return state;
    const won = (bet.side === 'heads') === heads;
    const bankroll = Math.min(CAP_CENTS, state.bankroll + (won ? bet.cents : -bet.cents));
    const flips = state.flips + 1;
    const ended = bankroll <= 0 ? 'bust' : bankroll >= CAP_CENTS ? 'cap' : flips >= MAX_FLIPS ? 'flips' : null;
    return {bankroll, flips, path: [...state.path, bankroll], ended};
};

// A whole game from its seed and bets: what the server checks a reported score against. A bet
// the game would refuse ends the replay there.
export const replayKelly = (seed: number, bets: readonly Bet[]): KellyState => {
    const flips = flipsFor(seed);
    let state = KELLY_START;
    for (const [i, bet] of bets.entries()) {
        if (state.ended !== null || i >= MAX_FLIPS || !isValidBet(state, bet)) break;
        state = playFlip(state, bet, flips[i]);
    }
    return state;
};

// A fixed rule's bankroll path over the same flips: `fraction` of the bankroll on heads each flip,
// rounded down to whole cents (at least one while anything is left).
export const fixedFractionPath = (flips: readonly boolean[], fraction: number, count: number): number[] => {
    let state = KELLY_START;
    for (let i = 0; i < count && state.ended === null; i++) {
        const cents = Math.max(1, Math.min(state.bankroll, Math.floor(state.bankroll * fraction)));
        state = playFlip(state, {side: 'heads', cents}, flips[i]);
    }
    return state.path;
};

// Expected growth of the log of the bankroll per flip when `fraction` of it is bet on heads:
// p·ln(1 + f) + q·ln(1 − f). It is highest at the Kelly fraction and −∞ for everything at once.
export const logGrowth = (fraction: number, p = HEADS_PROBABILITY): number =>
    fraction >= 1 ? -Infinity : p * Math.log(1 + fraction) + (1 - p) * Math.log(1 - fraction);

export const COMPARISONS = [
    {id: 'kelly', fraction: KELLY_FRACTION},
    {id: 'half-kelly', fraction: KELLY_FRACTION / 2},
    {id: 'all-in', fraction: 1},
] as const;
