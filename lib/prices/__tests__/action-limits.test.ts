import {readFileSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {
    ACTION_WINDOW_MS,
    ORDER_USER_LIMIT,
    SEARCH_QUERY_MAX,
    SEARCH_USER_LIMIT,
    orderUserKey,
    searchQuery,
    searchUserKey,
    withinOrderLimit,
    withinSearchLimit,
    type TakeCounter,
} from '@/lib/prices/action-limits';

// Finnhub's free plan: the one minute every reader's prices share (lib/prices/config.ts).
const FINNHUB_CALLS_A_MINUTE = 60;

// A counter that records each step it is asked for and answers as told.
const recording = (answer: boolean) => {
    const steps: {key: string; limit: number; windowMs: number}[] = [];
    const take: TakeCounter = async (key, limit, windowMs) => {
        steps.push({key, limit, windowMs});
        return answer;
    };
    return {steps, take};
};

describe('the limits on the actions that ask Finnhub for a reader', () => {
    it('counts 30 searches and 20 orders a reader, by the minute', () => {
        expect(SEARCH_USER_LIMIT).toBe(30);
        expect(ORDER_USER_LIMIT).toBe(20);
        expect(ACTION_WINDOW_MS).toBe(60_000);
    });

    // A search is one call; an order is a quote and, for a symbol not asked about that day, a profile.
    it('leaves either one, alone, under the plan\'s minute', () => {
        expect(SEARCH_USER_LIMIT).toBeLessThan(FINNHUB_CALLS_A_MINUTE);
        expect(ORDER_USER_LIMIT * 2).toBeLessThan(FINNHUB_CALLS_A_MINUTE);
    });

    it('keys each counter on the reader, apart from the other', () => {
        expect(searchUserKey('u1')).toBe('search:u1');
        expect(orderUserKey('u1')).toBe('order:u1');
        expect(searchUserKey('u1')).not.toBe(searchUserKey('u2'));
        expect(searchUserKey('u1')).not.toBe(orderUserKey('u1'));
    });
});

describe('searchQuery', () => {
    it('reads a string, trimmed', () => {
        expect(searchQuery('AAPL')).toBe('AAPL');
        expect(searchQuery('  berkshire hathaway\t')).toBe('berkshire hathaway');
    });

    it('reads nothing typed as the empty query, which asks Finnhub nothing', () => {
        expect(searchQuery(undefined)).toBe('');
        expect(searchQuery('')).toBe('');
        expect(searchQuery('   ')).toBe('');
    });

    it('reads a query of 40 characters and refuses one of 41', () => {
        expect(SEARCH_QUERY_MAX).toBe(40);
        expect(searchQuery('a'.repeat(40))).toBe('a'.repeat(40));
        expect(searchQuery(` ${'a'.repeat(40)} `)).toBe('a'.repeat(40));
        expect(searchQuery('a'.repeat(41))).toBeNull();
        expect(searchQuery('a'.repeat(100_000))).toBeNull();
    });

    // A server action's argument is whatever the client posted, whatever its type says.
    it('refuses anything that is not a string', () => {
        for (const input of [null, 7, true, {}, [], ['AAPL'], {toString: () => 'AAPL'}, Symbol('AAPL')]) {
            expect(searchQuery(input), String(typeof input)).toBeNull();
        }
    });
});

describe('withinSearchLimit', () => {
    it('spends one step of the reader\'s search counter and answers as it does', async () => {
        const within = recording(true);
        expect(await withinSearchLimit('u1', within.take)).toBe(true);
        expect(within.steps).toEqual([{key: 'search:u1', limit: 30, windowMs: 60_000}]);

        const over = recording(false);
        expect(await withinSearchLimit('u1', over.take)).toBe(false);
        expect(over.steps).toHaveLength(1);
    });
});

describe('withinOrderLimit', () => {
    it('spends one step of the reader\'s order counter and answers as it does', async () => {
        const within = recording(true);
        expect(await withinOrderLimit('u1', within.take)).toBe(true);
        expect(within.steps).toEqual([{key: 'order:u1', limit: 20, windowMs: 60_000}]);

        const over = recording(false);
        expect(await withinOrderLimit('u1', over.take)).toBe(false);
        expect(over.steps).toHaveLength(1);
    });
});

// The actions cannot be imported here (invariant 1), so their source is read as text: the
// order each one checks things in is what keeps a refused call from costing Finnhub anything.
describe('the two actions', () => {
    // One exported action's own text: from its declaration to the next export.
    const actionSource = (file: string, name: string): string => {
        const source = readFileSync(path.resolve(__dirname, '../../..', file), 'utf8');
        const start = source.indexOf(`export const ${name} = `);
        expect(start, `${name} in ${file}`).toBeGreaterThan(-1);
        const next = source.indexOf('\nexport const ', start + 1);
        return source.slice(start, next === -1 ? undefined : next);
    };
    const inOrder = (text: string, calls: readonly string[]): number[] => calls.map((call) => text.indexOf(call));

    it('searchStocks reads its input, then the session, then its counter, before it asks Finnhub', () => {
        const body = actionSource('lib/actions/stocks.actions.ts', 'searchStocks');
        const at = inOrder(body, ['searchQuery(', 'getCurrentUserId(', 'withinSearchLimit(userId, takeRateLimit)', 'fetchStocks(']);
        expect(at.every((index) => index > -1), JSON.stringify(at)).toBe(true);
        expect(at).toEqual([...at].sort((a, b) => a - b));
        // The one call to Finnhub's search is the last thing it does.
        expect(body.split('fetchStocks(')).toHaveLength(2);
    });

    it('placeOrder reads the session, then spends its counter, before the order is executed', () => {
        const body = actionSource('lib/actions/trading.actions.ts', 'placeOrder');
        const at = inOrder(body, ['getCurrentUserId(', 'withinOrderLimit(userId, takeRateLimit)', 'ORDER_COPY.tooFast', 'executeOrder(']);
        expect(at.every((index) => index > -1), JSON.stringify(at)).toBe(true);
        expect(at).toEqual([...at].sort((a, b) => a - b));
    });
});
