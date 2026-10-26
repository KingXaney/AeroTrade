// The Alpaca client: its key headers on every request, Alpaca's string numbers read as numbers,
// an order sent as dollars or whole shares with its client id, and every failure an answer
// (never a throw) with Alpaca's own message.

import {describe, expect, it} from 'vitest';
import {createAlpacaClient, isDuplicateOrder} from '@/lib/broker/alpaca';

type Call = {url: string; method: string; headers: Record<string, string>; body: unknown};

const stub = (handler: (call: Call) => Response) => {
    const calls: Call[] = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
        const call = {url: String(url), method: init?.method ?? 'GET', headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body ? JSON.parse(String(init.body)) : null};
        calls.push(call);
        return handler(call);
    }) as unknown as typeof fetch;
    return {calls, client: createAlpacaClient({baseUrl: 'https://paper.test', keyId: 'PKTEST', secret: 's3cret', fetchImpl})};
};

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});

describe('createAlpacaClient', () => {
    it('reads the account, its numbers from strings, with the key headers', async () => {
        const {calls, client} = stub(() => json(200, {account_number: 'PA3ABCD1234', status: 'ACTIVE', currency: 'USD', equity: '100250.50', cash: '20000', buying_power: '40000.10', trading_blocked: false}));
        const result = await client.account();
        expect(result).toEqual({ok: true, data: {accountNumber: 'PA3ABCD1234', status: 'ACTIVE', currency: 'USD', equity: 100250.5, cash: 20000, buyingPower: 40000.1, tradingBlocked: false}});
        expect(calls[0].url).toBe('https://paper.test/v2/account');
        expect(calls[0].headers).toMatchObject({'APCA-API-KEY-ID': 'PKTEST', 'APCA-API-SECRET-KEY': 's3cret'});
    });

    it('reads positions, the clock and an asset', async () => {
        const {client} = stub((call) => {
            if (call.url.endsWith('/v2/positions')) return json(200, [{symbol: 'NVDA', qty: '3.25', market_value: '650.00', current_price: '200', avg_entry_price: '180'}]);
            if (call.url.endsWith('/v2/clock')) return json(200, {is_open: true, next_open: '2026-10-27T13:30:00Z', next_close: '2026-10-26T20:00:00Z', timestamp: 'x'});
            return json(200, {symbol: 'BRK.B', tradable: true, fractionable: false, status: 'active'});
        });
        expect(await client.positions()).toEqual({ok: true, data: [{symbol: 'NVDA', qty: 3.25, marketValue: 650, price: 200, avgEntryPrice: 180}]});
        expect(await client.clock()).toEqual({ok: true, data: {isOpen: true, nextOpen: '2026-10-27T13:30:00Z', nextClose: '2026-10-26T20:00:00Z'}});
        expect(await client.asset('BRK.B')).toEqual({ok: true, data: {symbol: 'BRK.B', tradable: true, fractionable: false}});
    });

    it('sends an order as dollars or whole shares, a market day order with its client id', async () => {
        const {calls, client} = stub(() => json(200, {id: 'o1', client_order_id: 'aero-1', symbol: 'NVDA', side: 'buy', status: 'accepted', qty: null, notional: '150.25', filled_qty: '0', filled_avg_price: null, submitted_at: '2026-10-26T15:15:00Z'}));
        const placed = await client.submitOrder({symbol: 'NVDA', side: 'buy', notional: 150.25, clientOrderId: 'aero-1'});
        expect(calls[0]).toMatchObject({method: 'POST', url: 'https://paper.test/v2/orders', body: {symbol: 'NVDA', side: 'buy', type: 'market', time_in_force: 'day', notional: '150.25', client_order_id: 'aero-1'}});
        expect(placed).toMatchObject({ok: true, data: {id: 'o1', clientOrderId: 'aero-1', status: 'accepted', notional: 150.25, qty: null, filledQty: 0, filledAvgPrice: null}});
        await client.submitOrder({symbol: 'BRK.B', side: 'sell', qty: 2, clientOrderId: 'aero-2'});
        expect(calls[1].body).toEqual({symbol: 'BRK.B', side: 'sell', type: 'market', time_in_force: 'day', qty: '2', client_order_id: 'aero-2'});
    });

    it('answers a refusal with its status and Alpaca\'s message, and a network failure with status 0', async () => {
        const {client} = stub(() => json(403, {code: 40310000, message: 'insufficient buying power'}));
        expect(await client.submitOrder({symbol: 'NVDA', side: 'buy', notional: 1e9, clientOrderId: 'x'})).toEqual({ok: false, status: 403, message: 'insufficient buying power'});
        const broken = createAlpacaClient({baseUrl: 'https://paper.test', keyId: 'k', secret: 's', fetchImpl: (async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch});
        expect(await broken.account()).toEqual({ok: false, status: 0, message: 'ECONNREFUSED'});
        const garbled = createAlpacaClient({baseUrl: 'https://paper.test', keyId: 'k', secret: 's', fetchImpl: (async () => json(200, {nothing: true})) as unknown as typeof fetch});
        expect((await garbled.account()).ok).toBe(false);
    });

    it('lists recent orders, newest first', async () => {
        const {calls, client} = stub(() => json(200, [{id: 'o2', client_order_id: 'c2', symbol: 'XLK', side: 'sell', status: 'filled', qty: '2', notional: null, filled_qty: '2', filled_avg_price: '101.5', submitted_at: '2026-10-26T15:16:00Z'}]));
        expect(await client.orders(5)).toMatchObject({ok: true, data: [{id: 'o2', status: 'filled', qty: 2, filledQty: 2, filledAvgPrice: 101.5}]});
        expect(calls[0].url).toBe('https://paper.test/v2/orders?status=all&limit=5&direction=desc');
    });
});

describe('isDuplicateOrder', () => {
    it('reads Alpaca\'s refusal of a reused client id', () => {
        expect(isDuplicateOrder({ok: false, status: 422, message: 'client_order_id must be unique'})).toBe(true);
        expect(isDuplicateOrder({ok: false, status: 422, message: 'qty must be > 0'})).toBe(false);
        expect(isDuplicateOrder({ok: false, status: 403, message: 'client_order_id must be unique'})).toBe(false);
    });
});
