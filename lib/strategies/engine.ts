// The one code path that decides a strategy's day. The live job and the simulator
// both build a context here and call runStrategyDay, so no strategy logic can drift
// between the two. Pure: bars, positions and cash come in; orders come out.

import type {Bar} from '@/lib/prices/signals';
import {LOOKBACK_BARS, STALE_SKIP_FRACTION} from '@/lib/strategies/config';
import {planOrders} from '@/lib/strategies/rebalance';
import type {
    DayResult,
    Decide,
    Decision,
    Holding,
    PlannedOrder,
    SkippedOrder,
    StrategyContext,
    StrategyDefinition,
    Target,
} from '@/lib/strategies/types';
import {UNIVERSES} from '@/lib/strategies/universe';

const LEFT_UNIVERSE_REASON = 'left the strategy universe';

type Position = {symbol: string; quantity: number; avgCost: number};

const lastBar = (bars: readonly Bar[]): Bar | undefined => bars[bars.length - 1];

// The close on asOf, or null when the symbol's latest bar is older (or missing).
const closeOn = (bars: readonly Bar[] | undefined, asOf: string): number | null => {
    const last = bars === undefined ? undefined : lastBar(bars);
    return last !== undefined && last.date === asOf ? last.close : null;
};

export const buildContext = (def: StrategyDefinition, input: {
    barsBySymbol: ReadonlyMap<string, readonly Bar[]>;
    asOf: string;
    tradeDate: string;
    positions: readonly Position[];
    cash: number;
    lastRebalanceDate: string | null;
    isFirstRun: boolean;
}): StrategyContext => {
    const {asOf, tradeDate, positions, cash, lastRebalanceDate, isFirstRun} = input;
    const universe = UNIVERSES[def.universe];
    const symbols = new Set<string>([...universe, ...positions.map((position) => position.symbol)]);

    // Exactly the last LOOKBACK_BARS bars ≤ asOf, so an indicator can never see the
    // future or depend on how much older history happens to be stored.
    const bars = new Map<string, readonly Bar[]>();
    for (const symbol of symbols) {
        const history = input.barsBySymbol.get(symbol) ?? [];
        bars.set(symbol, history.filter((bar) => bar.date <= asOf).slice(-LOOKBACK_BARS));
    }

    const eligible = new Set<string>();
    const stale = new Set<string>();
    for (const symbol of universe) {
        if (closeOn(bars.get(symbol), asOf) === null) {
            stale.add(symbol);
        } else {
            eligible.add(symbol);
        }
    }

    const holdings: Holding[] = positions
        .filter((position) => position.quantity > 0)
        .map((position) => ({
            symbol: position.symbol,
            quantity: position.quantity,
            avgCost: position.avgCost,
            lastClose: closeOn(bars.get(position.symbol), asOf),
        }));
    // Cost basis stands in for an unpriced holding so equity never silently drops it.
    const equity = holdings.reduce(
        (sum, holding) => sum + holding.quantity * (holding.lastClose ?? holding.avgCost),
        cash,
    );

    return {asOf, tradeDate, bars, eligible, stale, holdings, cash, equity, lastRebalanceDate, isFirstRun};
};

const emptyDecision = (dataIssue: string): Decision => ({
    rebalanceTriggered: false,
    targets: [],
    board: [],
    dataIssues: [dataIssue],
});

export const runStrategyDay = (def: StrategyDefinition, ctx: StrategyContext, decide: Decide): DayResult => {
    const universe = UNIVERSES[def.universe];
    if (ctx.stale.size / universe.length > STALE_SKIP_FRACTION) {
        const staleList = Array.from(ctx.stale).sort().join(', ');
        const detail = `${ctx.stale.size}/${universe.length} symbols stale: ${staleList}`;
        return {
            decision: emptyDecision(detail),
            orders: [],
            skippedOrders: [],
            skipped: {reason: 'stale-data', detail},
        };
    }

    const decided = decide(def, ctx);

    // A rule only ever sees its universe; a holding that dropped out of it (a version
    // bump swapped a ticker) still has to be sold, with a price the rule never looked at.
    const universeSet = new Set(universe);
    const targeted = new Set(decided.targets.map((target) => target.symbol));
    const exits: Target[] = ctx.holdings
        .filter((holding) => !universeSet.has(holding.symbol) && !targeted.has(holding.symbol))
        .map((holding) => ({symbol: holding.symbol, weight: 0, reason: LEFT_UNIVERSE_REASON}));
    const decision: Decision = exits.length === 0 ? decided : {...decided, targets: [...decided.targets, ...exits]};

    // Any symbol with a bar dated asOf is priced — universe or held — so a left-universe
    // exit can fill while a stale symbol stays unpriced.
    const prices = new Map<string, number>();
    for (const [symbol, bars] of ctx.bars) {
        const close = closeOn(bars, ctx.asOf);
        if (close !== null) prices.set(symbol, close);
    }

    const planned = planOrders({
        equity: ctx.equity,
        cash: ctx.cash,
        holdings: ctx.holdings,
        targets: decision.targets,
        prices,
        stale: ctx.stale,
        driftBand: def.driftBand,
    });

    // Second line of defence: planOrders already refuses stale symbols, but nothing
    // downstream should ever have to trust that.
    const orders: PlannedOrder[] = [];
    const skippedOrders: SkippedOrder[] = [...planned.skipped];
    for (const order of planned.orders) {
        if (ctx.stale.has(order.symbol)) {
            skippedOrders.push({symbol: order.symbol, reason: 'stale'});
        } else {
            orders.push(order);
        }
    }

    return {decision, orders, skippedOrders};
};

export type SimAccount = {cash: number; positions: {symbol: string; quantity: number; avgCost: number}[]};

export type FillResult =
    | {ok: true; account: SimAccount; realizedPnl?: number; total: number}
    | {ok: false; reason: string};

// Mirrors executeOrder in lib/trading/orders.ts step for step (whole shares, the same
// rejections in the same order, VWAP cost, realised P&L, zero positions dropped) so a
// simulated fill and a live fill move an account identically. Never mutates.
export const applyFill = (
    account: SimAccount,
    order: {symbol: string; side: 'buy' | 'sell'; quantity: number},
    price: number,
    minCashAfter?: number,
): FillResult => {
    const qty = Math.floor(Number(order.quantity));
    if (!Number.isFinite(qty) || qty <= 0) {
        return {ok: false, reason: 'invalid quantity'};
    }
    if (typeof price !== 'number' || !(price > 0)) {
        return {ok: false, reason: 'no price'};
    }
    const total = qty * price;
    const positions = account.positions.map((position) => ({...position}));
    let cash = account.cash;
    let realizedPnl: number | undefined;
    const existing = positions.find((position) => position.symbol === order.symbol);

    if (order.side === 'buy') {
        if (total > cash) {
            return {ok: false, reason: 'insufficient cash'};
        }
        if (typeof minCashAfter === 'number' && cash - total < minCashAfter) {
            return {ok: false, reason: 'cash floor'};
        }
        if (existing) {
            const newQty = existing.quantity + qty;
            existing.avgCost = (existing.avgCost * existing.quantity + price * qty) / newQty;
            existing.quantity = newQty;
        } else {
            positions.push({symbol: order.symbol, quantity: qty, avgCost: price});
        }
        cash -= total;
    } else {
        if (!existing || existing.quantity < qty) {
            return {ok: false, reason: 'not held'};
        }
        realizedPnl = (price - existing.avgCost) * qty;
        existing.quantity -= qty;
        cash += total;
    }

    return {
        ok: true,
        account: {cash, positions: positions.filter((position) => position.quantity > 0)},
        ...(realizedPnl !== undefined ? {realizedPnl} : {}),
        total,
    };
};
