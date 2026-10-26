// The Broker section's view: the connection as the environment allows it, the accounts with who
// trades each (the brains' first), the weights side by side, the account number masked.

import {describe, expect, it} from 'vitest';
import {shapeBrokerView, type BrokerViewInput} from '@/lib/broker/view';

const base: BrokerViewInput = {
    settings: {configured: true, mode: 'paper', baseUrl: 'https://paper', blocked: null},
    link: null,
    accounts: [
        {id: 'a1', name: 'Main account', tradedBy: null},
        {id: 'a2', name: 'AI Navigator', tradedBy: {kind: 'navigator'}},
        {id: 'a3', name: 'Culture · Spike', tradedBy: {kind: 'culture', profile: 'spike', status: 'active'}},
    ],
    alpaca: {ok: true, account: {accountNumber: 'PA3XYZ9F2A', status: 'ACTIVE', currency: 'USD', equity: 10_000, cash: 4_000, buyingPower: 8_000, tradingBlocked: false},
        positions: [{symbol: 'NVDA', qty: 15, marketValue: 3_000, price: 200, avgEntryPrice: 190}, {symbol: 'OLD', qty: 30, marketValue: 3_000, price: 100, avgEntryPrice: 90}],
        orders: []},
    sourceWeights: null,
};

describe('shapeBrokerView', () => {
    it('masks the account number to its last four and lists the brains\' accounts first', () => {
        const view = shapeBrokerView(base);
        expect(view.connection).toMatchObject({state: 'connected', mode: 'paper', last4: '9F2A', equity: 10_000, cash: 4_000, buyingPower: 8_000});
        expect(JSON.stringify(view)).not.toContain('PA3XYZ');
        expect(view.accounts.map((a) => [a.id, a.tradedBy])).toEqual([['a2', 'the AI Navigator'], ['a3', 'the Spike culture picker'], ['a1', null]]);
        expect(view.link).toBeNull();
    });

    it('says why nothing connects: no keys, live locked, or Alpaca refusing', () => {
        expect(shapeBrokerView({...base, settings: {configured: false, mode: 'paper', baseUrl: null, blocked: 'no-keys'}, alpaca: null}).connection).toEqual({state: 'no-keys', mode: 'paper'});
        expect(shapeBrokerView({...base, settings: {configured: true, mode: 'live', baseUrl: null, blocked: 'live-locked'}, alpaca: null}).connection).toEqual({state: 'live-locked', mode: 'live'});
        expect(shapeBrokerView({...base, alpaca: {ok: false, message: 'HTTP 401 unauthorized'}}).connection).toEqual({state: 'unreachable', mode: 'paper', message: 'HTTP 401 unauthorized'});
    });

    it('sets the linked account\'s weights beside Alpaca\'s, every symbol either holds', () => {
        const view = shapeBrokerView({
            ...base,
            link: {id: 'l1', userId: 'u', sourceAccountId: 'a2', status: 'active', createdAt: '2026-10-24T15:00:00.000Z', syncs: []},
            sourceWeights: new Map([['NVDA', 0.25], ['XLK', 0.2]]),
        });
        expect(view.link).toMatchObject({sourceName: 'AI Navigator', since: '2026-10-24', status: 'active'});
        expect(view.comparison).toEqual([
            {symbol: 'NVDA', paper: 0.25, alpaca: 0.3},
            {symbol: 'XLK', paper: 0.2, alpaca: 0},
            {symbol: 'OLD', paper: 0, alpaca: 0.3},
        ]);
    });

    it('names a linked account that is gone as gone, and draws no comparison without weights', () => {
        const view = shapeBrokerView({...base, link: {id: 'l1', userId: 'u', sourceAccountId: 'zz', status: 'paused', createdAt: '2026-10-20T00:00:00.000Z', syncs: []}});
        expect(view.link).toMatchObject({sourceName: null, status: 'paused'});
        expect(view.comparison).toEqual([]);
    });
});
