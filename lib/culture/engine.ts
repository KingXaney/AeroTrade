// The ONE place a culture picker's week is decided: the scores, the targets and the orders
// from the same inputs, under the same rails, whether the weekly job or the backtest asks.
// Pure; the allocator is the Navigator's, parameterised with the culture rails.

import {CULTURE_RAILS, type CultureFeed, type ProfileId} from "@/lib/culture/config";
import {scoreCultureUniverse, type CultureScoringInput} from "@/lib/culture/scoring";
import {buildTargets, diffToOrders, type HeldPosition, type PlannedOrder, type TargetWeight} from "@/lib/navigator/allocator";
import type {ScoredSymbol} from "@/lib/navigator/scoring";

export type Book = {totalValue: number; cash: number; positions: HeldPosition[]};

export type WeekDecision = {scored: ScoredSymbol[]; targets: TargetWeight[]; orders: PlannedOrder[]};

export const decideWeek = ({inputs, feeds, profile, book, targetable, maxTrades}: {
    inputs: readonly CultureScoringInput[];
    feeds: readonly CultureFeed[];
    profile: ProfileId;
    book: Book;
    // Symbols that may be bought; a held name outside it is scored for its exit only.
    targetable: ReadonlySet<string>;
    maxTrades?: number;
}): WeekDecision => {
    const scored = scoreCultureUniverse(inputs, {profile, feeds});
    const scoreBySymbol = new Map(scored.map((s) => [s.symbol, s]));
    const targets = buildTargets(scored.filter((s) => targetable.has(s.symbol)), CULTURE_RAILS);
    // The week's score reaches every held row, so an exit trigger reads this week's number.
    const positions = book.positions.map((position) => ({...position, score: scoreBySymbol.get(position.symbol)?.score ?? position.score}));
    const orders = diffToOrders({totalValue: book.totalValue, cash: book.cash, positions, targets, maxTrades, rails: CULTURE_RAILS});
    return {scored, targets, orders};
};

// A run that finds an empty book deploys the whole first portfolio in one week, as the
// Navigator's enrollment bootstrap does; the simulator applies the same lift on its first week.
export const firstWeekTrades = (positions: readonly HeldPosition[]): number | undefined =>
    positions.some((position) => position.quantity > 0) ? undefined : CULTURE_RAILS.maxPositions;
