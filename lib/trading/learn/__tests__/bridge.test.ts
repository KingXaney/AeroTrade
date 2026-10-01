// The return bridge: an account's total return split into what moved it — price moves on
// shares still held, results locked in by sells, interest on cash and dividends — adding
// up to the Total Return tile to the cent. The ledger below is folded through the engine's
// applyFill (lib/strategies/engine.ts, the mirror of executeOrder), never a copy of the fill
// arithmetic, so an account whose every sell recorded its result has nothing left over; only a
// legacy sell stored without one shows as residual.

import {describe, expect, it} from 'vitest';
import {applyFill, type SimAccount} from '@/lib/strategies/engine';
import {buildReturnBridge, toCents, type BridgeInput, type ReturnBridge} from '@/lib/trading/learn/bridge';
import {formatPrice} from '@/lib/utils';

const held = (unrealizedPnl: number, priceStale = false) => ({unrealizedPnl, priceStale});

const input = (patch: Partial<BridgeInput> = {}): BridgeInput => ({
    totalReturn: 469.14,
    positions: [held(0, true), held(0, true)],
    realizedPnl: 300,
    income: {interest: 150.25, dividends: 18.89},
    tradeCount: 4,
    ...patch,
});

const cents = (bridge: ReturnBridge) => bridge.lines.reduce((sum, line) => sum + line.cents, 0);
const amountOf = (bridge: ReturnBridge, key: string) => bridge.lines.find((line) => line.key === key)?.cents;

describe('buildReturnBridge', () => {
    it('has nothing to split before the first trade or credit', () => {
        expect(buildReturnBridge(input({tradeCount: 0, income: {interest: 0, dividends: 0}, totalReturn: 0, positions: []}))).toBeNull();
        expect(buildReturnBridge(input({tradeCount: 0, income: undefined, totalReturn: 0, positions: []}))).toBeNull();
    });

    it('splits the return into four lines that add up to the total', () => {
        const bridge = buildReturnBridge(input());
        expect(bridge?.lines.map((line) => line.key)).toEqual(['price', 'realized', 'interest', 'dividends']);
        expect(bridge?.totalCents).toBe(46_914);
        expect(cents(bridge as ReturnBridge)).toBe(46_914);
        expect(amountOf(bridge as ReturnBridge, 'realized')).toBe(30_000);
        expect(amountOf(bridge as ReturnBridge, 'interest')).toBe(15_025);
        expect(amountOf(bridge as ReturnBridge, 'dividends')).toBe(1_889);
    });

    it('shows a legacy sell stored without its result as a residual line', () => {
        const bridge = buildReturnBridge(input({totalReturn: 569.14})) as ReturnBridge;
        expect(bridge.lines.map((line) => line.key)).toEqual(['price', 'realized', 'interest', 'dividends', 'residual']);
        expect(amountOf(bridge, 'residual')).toBe(10_000);
        expect(cents(bridge)).toBe(56_914);
    });

    it('adds up to the cent whatever floating point does to the parts', () => {
        for (const [total, price, realized, interest, dividends] of [
            [0.1 + 0.2, 0.1, 0.2, 0, 0],
            [1234.565, 1000.005, 200.005, 34.555, 0],
            [-987.654, -1200.333, 100.111, 99.999, 12.569],
            [0.004, 0.001, 0.001, 0.001, 0.001],
            [-0.015, -0.005, -0.005, -0.005, 0],
            [1.005, 1, 0.005, 0, 0],
            [-2.675, -2, -0.675, 0, 0],
        ]) {
            const bridge = buildReturnBridge(input({totalReturn: total, positions: [held(price)], realizedPnl: realized, income: {interest, dividends}})) as ReturnBridge;
            expect(cents(bridge), String(total)).toBe(bridge.totalCents);
            // The total is the tile's own figure: formatPrice rounds 1.005 to $1.01.
            expect(formatPrice(bridge.totalCents / 100), String(total)).toBe(formatPrice(total));
            for (const line of bridge.lines) expect(Number.isInteger(line.cents)).toBe(true);
        }
    });

    it('leaves nothing over when every sell recorded its result (executeOrder arithmetic)', () => {
        // Buys and sells priced like real quotes, each one through applyFill: cash, average cost
        // and the realized result a sell records all come from the one fill implementation.
        const start = 100_000;
        const orders: [string, 'buy' | 'sell', number, number][] = [
            ['AAPL', 'buy', 7, 187.33],
            ['AAPL', 'buy', 13, 191.07],
            ['MSFT', 'buy', 3, 411.29],
            ['AAPL', 'sell', 9, 199.99],
            ['MSFT', 'sell', 3, 398.41],
            ['NVDA', 'buy', 11, 121.13],
        ];
        const {account, realized} = orders.reduce<{account: SimAccount; realized: number}>((acc, [symbol, side, quantity, price]) => {
            const fill = applyFill(acc.account, {symbol, side, quantity}, price);
            if (!fill.ok) throw new Error(`${side} ${quantity} ${symbol}: ${fill.reason}`);
            return {account: fill.account, realized: acc.realized + (fill.realizedPnl ?? 0)};
        }, {account: {cash: start, positions: []}, realized: 0});
        const interest = 212.4387;
        const dividends = 4.1633;
        const cash = account.cash + interest + dividends;
        const quotes: Record<string, number> = {AAPL: 203.51, NVDA: 118.77};
        expect(account.positions.map((p) => p.symbol).sort()).toEqual(['AAPL', 'NVDA']);
        const positions = account.positions.map((p) => held((quotes[p.symbol] - p.avgCost) * p.quantity));
        const totalValue = cash + account.positions.reduce((sum, p) => sum + quotes[p.symbol] * p.quantity, 0);

        const bridge = buildReturnBridge({
            totalReturn: totalValue - start, positions, realizedPnl: realized, income: {interest, dividends}, tradeCount: 6,
        }) as ReturnBridge;
        expect(bridge.lines.map((line) => line.key)).not.toContain('residual');
        expect(cents(bridge)).toBe(toCents(totalValue - start));
    });

    it('rounds cents the way the tile prints money, sign symmetric', () => {
        expect(toCents(1.005)).toBe(101);
        expect(toCents(-2.675)).toBe(-268);
        expect(toCents(-0.001)).toBe(0);
        expect(Object.is(toCents(-0.001), -0)).toBe(false);
    });

    it('states the share of the return that came from income, when the return is a gain', () => {
        expect(buildReturnBridge(input())?.incomeShare).toBeCloseTo((169.14 / 469.14) * 100, 10);
        // Income larger than the whole return: trading lost what income did not cover.
        expect(buildReturnBridge(input({totalReturn: 100, realizedPnl: -69.14}))?.incomeShare).toBeCloseTo(169.14, 10);
        expect(buildReturnBridge(input({totalReturn: -50, realizedPnl: -219.14}))?.incomeShare).toBeNull();
        expect(buildReturnBridge(input({income: {interest: 0, dividends: 0}, totalReturn: 300}))?.incomeShare).toBeNull();
        expect(buildReturnBridge(input())?.income).toBeCloseTo(169.14, 10);
    });

    it('counts the holdings whose price move is valued at cost', () => {
        expect(buildReturnBridge(input())).toMatchObject({unpriced: 2, holdings: 2});
        expect(buildReturnBridge(input({positions: [held(10), held(0, true)], totalReturn: 479.14}))).toMatchObject({unpriced: 1, holdings: 2});
    });

    it('still splits an account that has traded but not yet earned', () => {
        const bridge = buildReturnBridge(input({income: undefined, totalReturn: 300, positions: []}));
        expect(bridge?.lines.map((line) => [line.key, line.cents])).toEqual([['price', 0], ['realized', 30_000], ['interest', 0], ['dividends', 0]]);
    });
});
