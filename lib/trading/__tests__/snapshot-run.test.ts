// The snapshot job's stamp and its two small decisions.

import {describe, expect, it} from 'vitest';
import {easternToInstant} from '@/lib/prices/market-hours';
import {describeSnapshotRun, isLatePass, splitSuspects, type SnapshotRun} from '@/lib/trading/snapshot-run';

const run = (over: Partial<SnapshotRun>): SnapshotRun => ({
    accounts: 5, written: 5, atClose: [], skipped: [], late: false, benchmark: {symbol: 'SPY', state: 'recorded'}, splits: [], ...over,
});

describe('isLatePass', () => {
    it('is the 16:40 run, not the 16:10 one', () => {
        expect(isLatePass(easternToInstant('2026-11-17', 16, 10))).toBe(false);
        expect(isLatePass(easternToInstant('2026-11-17', 16, 29))).toBe(false);
        expect(isLatePass(easternToInstant('2026-11-17', 16, 40))).toBe(true);
        expect(isLatePass(easternToInstant('2026-07-17', 16, 40))).toBe(true);
    });

    it('is not late without a time to read', () => {
        expect(isLatePass(undefined)).toBe(false);
    });
});

describe('splitSuspects', () => {
    it('names the symbols whose quote is far from their last stored close', () => {
        const prices = new Map([['NVDA', {price: 120}], ['AAPL', {price: 201}], ['XYZ', {price: 30}], ['NOQ', {}], ['NEW', {price: 50}]]);
        const closes = new Map([['NVDA', {close: 1200}], ['AAPL', {close: 200}], ['XYZ', {close: 20}], ['NOQ', {close: 10}]]);
        expect(splitSuspects(prices, closes)).toEqual(['NVDA', 'XYZ']);
    });

    it('leaves a move inside the band alone', () => {
        expect(splitSuspects(new Map([['A', {price: 114.9}], ['B', {price: 85.1}]]), new Map([['A', {close: 100}], ['B', {close: 100}]]))).toEqual([]);
    });
});

describe('describeSnapshotRun', () => {
    it('says how many were written and that the benchmark was recorded', () => {
        expect(describeSnapshotRun(run({}))).toBe('5 of 5 account(s) snapshotted; SPY recorded');
    });

    it('names the symbols that had no quote and says the benchmark was not recorded', () => {
        const stamp = describeSnapshotRun(run({
            written: 3,
            skipped: [{accountId: 'a', symbols: ['XYZ']}, {accountId: 'b', symbols: ['XYZ', 'ABC']}],
            benchmark: {symbol: 'SPY', state: 'missing'},
        }));
        expect(stamp).toBe('3 of 5 account(s) snapshotted; 2 skipped, no quote for ABC, XYZ; SPY not recorded');
    });

    it('never reads as healthy when nothing was written', () => {
        const stamp = describeSnapshotRun(run({written: 0, skipped: [{accountId: 'a', symbols: ['XYZ']}], accounts: 1, benchmark: {symbol: 'SPY', state: 'missing'}}));
        expect(stamp).toContain('0 of 1');
        expect(stamp).toContain('not recorded');
    });

    it('tells an account that changed mid-run from one with no quote', () => {
        expect(describeSnapshotRun(run({written: 4, skipped: [{accountId: 'a', symbols: []}]})))
            .toBe('4 of 5 account(s) snapshotted; 1 skipped, changed mid-run; SPY recorded');
    });

    it('says which holdings were valued at a stored close and which split was applied first', () => {
        const stamp = describeSnapshotRun(run({
            atClose: [{accountId: 'a', symbols: ['GONE']}],
            splits: [{accountId: 'a', symbol: 'NVDA', exDate: '2024-06-10', numerator: 10, denominator: 1, lateDays: 0}, {accountId: 'b', symbol: 'NVDA', exDate: '2024-06-10', numerator: 10, denominator: 1, lateDays: 0}],
        }));
        expect(stamp).toBe('5 of 5 account(s) snapshotted; 1 valued a holding at its last stored close (GONE); NVDA 10-for-1 split applied before valuing; SPY recorded');
    });

    it('says a late pass found nothing left to do', () => {
        expect(describeSnapshotRun(run({accounts: 0, written: 0, late: true, benchmark: {symbol: 'SPY', state: 'kept'}})))
            .toBe('Late pass: every account already has today\'s close');
    });

    it('says what a late pass caught up', () => {
        expect(describeSnapshotRun(run({accounts: 2, written: 1, late: true, skipped: [{accountId: 'a', symbols: ['XYZ']}], benchmark: {symbol: 'SPY', state: 'kept'}})))
            .toBe('Late pass: 1 of 2 account(s) snapshotted; 1 skipped, no quote for XYZ; SPY already recorded');
    });
});
