import {describe, expect, it} from 'vitest';
import {incomeRowKey, planIncomeDedupe} from '@/scripts/income-dedupe.mjs';

const EPOCH = Date.parse('2026-07-29T14:00:00Z');
const ACCOUNT = 'acct-1';

type Row = {_id: string; accountId: string; epoch: number; kind: 'interest' | 'dividend'; date: string; symbol: string; amount: number; createdAt: Date};

let next = 0;
const row = (kind: Row['kind'], date: string, amount: number, extra: Partial<Row> = {}): Row => ({
    _id: `row-${(next += 1)}`,
    accountId: ACCOUNT,
    epoch: EPOCH,
    kind,
    date,
    symbol: kind === 'interest' ? '' : 'XLE',
    amount,
    createdAt: new Date(Date.parse('2026-09-28T04:05:00Z') + next * 1000),
    ...extra,
});

// The Navigator account's shape: a day of interest and a dividend, each written twice by two
// runs at once, both copies credited to cash by the run that won the watermark.
const ledger = () => {
    const interest = row('interest', '2026-08-04', 0.43);
    const interestCopy = row('interest', '2026-08-04', 0.43);
    const dividend = row('dividend', '2026-09-26', 7.22);
    const dividendCopy = row('dividend', '2026-09-26', 7.22);
    const clean = row('interest', '2026-10-01', 0.1);
    return {interest, interestCopy, dividend, dividendCopy, clean, rows: [interest, interestCopy, dividend, dividendCopy, clean]};
};

// Cash = start + trades + every row credited (copies included): the books the job left.
const accountFor = (rows: Row[], {tradeCash = -5000, incomeThrough = '2026-10-29'}: {tradeCash?: number; incomeThrough?: string | null} = {}) => ({
    epoch: EPOCH,
    incomeThrough,
    startingBalance: 10_000,
    cash: 10_000 + tradeCash + rows.filter((r) => incomeThrough !== null && r.date <= incomeThrough).reduce((sum, r) => sum + r.amount, 0),
});

describe('incomeRowKey', () => {
    it('is the unique index: account, epoch, kind, date and symbol', () => {
        const a = row('dividend', '2026-09-26', 1);
        expect(incomeRowKey(a)).toBe(incomeRowKey({...a, _id: 'other', amount: 2, createdAt: new Date()}));
        expect(incomeRowKey(a)).not.toBe(incomeRowKey({...a, symbol: 'XLK'}));
        expect(incomeRowKey(a)).not.toBe(incomeRowKey({...a, epoch: a.epoch + 1}));
        expect(incomeRowKey({...a, symbol: undefined as unknown as string})).toBe(incomeRowKey({...a, symbol: ''}));
    });
});

describe('planIncomeDedupe', () => {
    it('changes nothing on a ledger with one row per key', () => {
        const rows = [row('interest', '2026-08-01', 0.95), row('dividend', '2026-09-26', 7.22)];
        const plan = planIncomeDedupe({rows, account: accountFor(rows), tradeCash: -5000, snapshots: []});
        expect(plan.remove).toEqual([]);
        expect(plan.credited.total).toBe(0);
        expect(plan.snapshots).toEqual([]);
        expect(plan.reconciles).toBe(true);
    });

    it('removes the later copy of each key and takes the copies off cash', () => {
        const {interestCopy, dividendCopy, rows} = ledger();
        const plan = planIncomeDedupe({rows, account: accountFor(rows), tradeCash: -5000, snapshots: []});
        expect(plan.remove.sort()).toEqual([interestCopy._id, dividendCopy._id].sort());
        expect(plan.credited).toMatchObject({interest: 0.43, dividends: 7.22, total: 7.65});
        expect(plan.cashAfter).toBeCloseTo(10_000 - 5000 + 0.43 + 7.22 + 0.1, 9);
        expect(plan.reconciles).toBe(true);
    });

    it('keeps the first row written, whatever the order they are read in', () => {
        const {interest, interestCopy} = ledger();
        const rows = [interestCopy, interest];
        const plan = planIncomeDedupe({rows, account: accountFor(rows), tradeCash: -5000, snapshots: []});
        expect(plan.remove).toEqual([interestCopy._id]);
    });

    it('takes a copy past the watermark, or of an older epoch, out of the ledger but not out of cash', () => {
        const late = row('interest', '2026-10-30', 0.1);
        const lateCopy = row('interest', '2026-10-30', 0.1);
        const old = row('interest', '2026-07-01', 0.9, {epoch: EPOCH - 86_400_000});
        const oldCopy = row('interest', '2026-07-01', 0.9, {epoch: EPOCH - 86_400_000});
        const rows = [late, lateCopy, old, oldCopy];
        const account = {...accountFor([]), cash: 5000};
        const plan = planIncomeDedupe({rows, account, tradeCash: -5000, snapshots: []});
        expect(plan.remove.sort()).toEqual([lateCopy._id, oldCopy._id].sort());
        expect(plan.credited.total).toBe(0);
        expect(plan.reconciles).toBe(true);
    });

    it('takes from each snapshot exactly the copies its income watermark had counted', () => {
        const {rows} = ledger();
        const snapshots = [
            {_id: 'snap-aug-03', date: '2026-08-03', epoch: EPOCH, incomeThrough: '2026-08-02'},
            {_id: 'snap-aug-05', date: '2026-08-05', epoch: EPOCH, incomeThrough: '2026-08-04'},
            {_id: 'snap-sep-28', date: '2026-09-28', epoch: EPOCH, incomeThrough: '2026-09-27'},
            {_id: 'snap-unstamped', date: '2026-07-30'},
            {_id: 'snap-other-epoch', date: '2026-09-28', epoch: EPOCH - 1, incomeThrough: '2026-09-27'},
        ];
        const plan = planIncomeDedupe({rows, account: accountFor(rows), tradeCash: -5000, snapshots});
        expect(plan.snapshots).toEqual([
            {_id: 'snap-aug-05', date: '2026-08-05', delta: 0.43},
            {_id: 'snap-sep-28', date: '2026-09-28', delta: expect.closeTo(7.65, 9)},
        ]);
    });

    it('treats a snapshot stamped before snapshots carried an epoch as the current one', () => {
        const {rows} = ledger();
        const plan = planIncomeDedupe({rows, account: accountFor(rows), tradeCash: -5000, snapshots: [{_id: 's', date: '2026-08-05', incomeThrough: '2026-08-04'}]});
        expect(plan.snapshots).toEqual([{_id: 's', date: '2026-08-05', delta: 0.43}]);
    });

    it('does not reconcile when the books are off for another reason, so nothing is applied', () => {
        const {rows} = ledger();
        const account = {...accountFor(rows), cash: accountFor(rows).cash + 3};
        const plan = planIncomeDedupe({rows, account, tradeCash: -5000, snapshots: []});
        expect(plan.remove).toHaveLength(2);
        expect(plan.mode).toBeNull();
        expect(plan.reconciles).toBe(false);
    });

    it('removes a copy the job never credited without touching cash or snapshots', () => {
        const {interest, dividend, clean, interestCopy, dividendCopy, rows} = ledger();
        // The books count each key once: what the job does since the repair.
        const account = accountFor([interest, dividend, clean]);
        const snapshots = [{_id: 'snap-sep-28', date: '2026-09-28', epoch: EPOCH, incomeThrough: '2026-09-27'}];
        const plan = planIncomeDedupe({rows, account, tradeCash: -5000, snapshots});
        expect(plan.mode).toBe('uncredited');
        expect(plan.remove.sort()).toEqual([interestCopy._id, dividendCopy._id].sort());
        expect(plan.credited.total).toBe(0);
        expect(plan.snapshots).toEqual([]);
        expect(plan.cashAfter).toBe(account.cash);
    });

    it('says the copies were credited when the books counted them', () => {
        const {rows} = ledger();
        expect(planIncomeDedupe({rows, account: accountFor(rows), tradeCash: -5000, snapshots: []}).mode).toBe('credited');
    });

    it('credits nothing for an account the job has never credited', () => {
        const {rows} = ledger();
        const account = {...accountFor([], {incomeThrough: null}), cash: 5000};
        const plan = planIncomeDedupe({rows, account, tradeCash: -5000, snapshots: []});
        expect(plan.credited.total).toBe(0);
        expect(plan.reconciles).toBe(true);
    });
});
