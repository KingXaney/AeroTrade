// The fill arithmetic executeOrder, the strategy simulator and the fill receipts share.

import {describe, expect, it} from 'vitest';
import {applyFill, type SimAccount} from '@/lib/trading/fill';

describe('applyFill', () => {
    const account: SimAccount = {cash: 10_000, positions: [{symbol: 'AAPL', quantity: 10, avgCost: 100}]};

    it('rejects a non-positive or fractional-to-zero quantity and a bad price', () => {
        expect(applyFill(account, {symbol: 'AAPL', side: 'buy', quantity: 0}, 100)).toEqual({ok: false, reason: 'invalid quantity'});
        expect(applyFill(account, {symbol: 'AAPL', side: 'buy', quantity: 0.9}, 100)).toEqual({ok: false, reason: 'invalid quantity'});
        expect(applyFill(account, {symbol: 'AAPL', side: 'buy', quantity: 1}, 0)).toEqual({ok: false, reason: 'no price'});
        expect(applyFill(account, {symbol: 'AAPL', side: 'buy', quantity: 1}, Number.NaN)).toEqual({ok: false, reason: 'no price'});
    });

    it('floors a fractional quantity to whole shares', () => {
        const result = applyFill(account, {symbol: 'MSFT', side: 'buy', quantity: 2.7}, 100);
        expect(result.ok && result.total).toBe(200);
        expect(result.ok && result.account.positions.find((p) => p.symbol === 'MSFT')?.quantity).toBe(2);
    });

    it('rejects a buy above available cash', () => {
        expect(applyFill(account, {symbol: 'MSFT', side: 'buy', quantity: 101}, 100)).toEqual({ok: false, reason: 'insufficient cash'});
        // Exactly all the cash is allowed (total > cash is the rejection, not >=).
        const all = applyFill(account, {symbol: 'MSFT', side: 'buy', quantity: 100}, 100);
        expect(all.ok && all.account.cash).toBe(0);
    });

    it('rejects a buy that would breach the cash floor, and checks cash before the floor', () => {
        expect(applyFill(account, {symbol: 'MSFT', side: 'buy', quantity: 95}, 100, 1_000)).toEqual({ok: false, reason: 'cash floor'});
        expect(applyFill(account, {symbol: 'MSFT', side: 'buy', quantity: 200}, 100, 1_000)).toEqual({ok: false, reason: 'insufficient cash'});
        const atFloor = applyFill(account, {symbol: 'MSFT', side: 'buy', quantity: 90}, 100, 1_000);
        expect(atFloor.ok && atFloor.account.cash).toBe(1_000);
    });

    it('averages cost by VWAP on an add', () => {
        // 10 @ 100 + 10 @ 120 → 20 @ 110.
        const result = applyFill(account, {symbol: 'AAPL', side: 'buy', quantity: 10}, 120);
        expect(result).toEqual({
            ok: true,
            total: 1_200,
            account: {cash: 8_800, positions: [{symbol: 'AAPL', quantity: 20, avgCost: 110}]},
        });
    });

    it('opens a new position at the fill price', () => {
        const result = applyFill(account, {symbol: 'MSFT', side: 'buy', quantity: 5}, 200);
        expect(result.ok && result.account).toEqual({
            cash: 9_000,
            positions: [{symbol: 'AAPL', quantity: 10, avgCost: 100}, {symbol: 'MSFT', quantity: 5, avgCost: 200}],
        });
    });

    it('rejects a sell of more than is held or of an unheld symbol', () => {
        expect(applyFill(account, {symbol: 'AAPL', side: 'sell', quantity: 11}, 100)).toEqual({ok: false, reason: 'not held'});
        expect(applyFill(account, {symbol: 'MSFT', side: 'sell', quantity: 1}, 100)).toEqual({ok: false, reason: 'not held'});
    });

    it('realises P&L against the average cost on a partial sell', () => {
        // Sell 4 @ 130: P&L = (130 − 100) × 4 = 120; cash + 520.
        const result = applyFill(account, {symbol: 'AAPL', side: 'sell', quantity: 4}, 130);
        expect(result).toEqual({
            ok: true,
            total: 520,
            realizedPnl: 120,
            account: {cash: 10_520, positions: [{symbol: 'AAPL', quantity: 6, avgCost: 100}]},
        });
    });

    it('removes a position sold down to zero, with a negative P&L intact', () => {
        const result = applyFill(account, {symbol: 'AAPL', side: 'sell', quantity: 10}, 90);
        expect(result).toEqual({ok: true, total: 900, realizedPnl: -100, account: {cash: 10_900, positions: []}});
    });

    it('never mutates the account it was given', () => {
        const frozenPositions = account.positions.map((position) => ({...position}));
        applyFill(account, {symbol: 'AAPL', side: 'buy', quantity: 5}, 120);
        applyFill(account, {symbol: 'AAPL', side: 'sell', quantity: 10}, 120);
        expect(account.cash).toBe(10_000);
        expect(account.positions).toEqual(frozenPositions);
        const result = applyFill(account, {symbol: 'AAPL', side: 'buy', quantity: 1}, 100);
        expect(result.ok && result.account).not.toBe(account);
        expect(result.ok && result.account.positions[0]).not.toBe(account.positions[0]);
    });
});

describe('applyFill — the company label a live fill carries', () => {
    const live: SimAccount = {cash: 10_000, positions: [{symbol: 'AAPL', quantity: 10, avgCost: 100, company: 'Apple'}]};

    it('stamps a buy\'s company on the position it opens or adds to', () => {
        const opened = applyFill(live, {symbol: 'MSFT', side: 'buy', quantity: 1, company: 'Microsoft'}, 100);
        expect(opened.ok && opened.account.positions[1]).toEqual({symbol: 'MSFT', quantity: 1, avgCost: 100, company: 'Microsoft'});
        const added = applyFill(live, {symbol: 'AAPL', side: 'buy', quantity: 10, company: 'Apple Inc.'}, 120);
        expect(added.ok && added.account.positions[0]).toEqual({symbol: 'AAPL', quantity: 20, avgCost: 110, company: 'Apple Inc.'});
    });

    it('leaves a holding\'s company alone on a sell, and adds none without one', () => {
        const sold = applyFill(live, {symbol: 'AAPL', side: 'sell', quantity: 4, company: 'Apple Inc.'}, 130);
        expect(sold.ok && sold.account.positions[0]).toEqual({symbol: 'AAPL', quantity: 6, avgCost: 100, company: 'Apple'});
        const bare = applyFill({cash: 1_000, positions: []}, {symbol: 'SPY', side: 'buy', quantity: 1}, 500);
        expect(bare.ok && bare.account.positions[0]).toEqual({symbol: 'SPY', quantity: 1, avgCost: 500});
    });

    it('matches symbols exactly — the caller resolves a holding\'s spelling', () => {
        expect(applyFill(live, {symbol: 'aapl', side: 'sell', quantity: 1}, 100)).toEqual({ok: false, reason: 'not held'});
    });
});
