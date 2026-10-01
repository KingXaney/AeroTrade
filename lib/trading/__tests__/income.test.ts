// The accrual convention every income path shares. If these hold, the nightly job, the
// back-credit and the strategy simulator cannot disagree about what an account earned.

import {describe, expect, it} from 'vitest';
import {
    CASH_YIELD_SPREAD,
    apyFromDiscount,
    bondEquivalentYield,
    createIncomeClock,
    dailyFactor,
    dividendsByExDate,
    holdingSpans,
    makeRateLookup,
    payDateFor,
    readyThrough,
    reconcile,
    describeIncomeRun,
    groupIncomeActivity,
    interestOverDays,
    replayIncome,
    usableRate,
    RATE_MAX_STALENESS_DAYS,
    type DividendPoint,
    type IncomeTrade,
    type RatePoint,
} from '@/lib/trading/income';

const RATES: RatePoint[] = [{date: '2026-09-01', discountPct: 4.07}];
const clockWith = (dividends: DividendPoint[] = [], rates: RatePoint[] = RATES) =>
    createIncomeClock({rateOn: makeRateLookup(rates), dividends: dividendsByExDate(dividends)});
const trade = (date: string, symbol: string, side: 'buy' | 'sell', quantity: number, price: number): IncomeTrade =>
    ({date, symbol, side, quantity, total: quantity * price});

describe('rates', () => {
    // ^IRX is a discount yield; a holder earns the bond-equivalent, then the broker keeps a spread.
    it('converts today\'s 4.07% discount to ~3.92% APY', () => {
        expect(bondEquivalentYield(4.07)).toBeCloseTo(0.041694, 5);
        expect(apyFromDiscount(4.07)).toBeCloseTo(0.041694 - CASH_YIELD_SPREAD, 5);
    });

    it('never pays a negative rate: 2021\'s 0.03% is below the spread', () => {
        expect(apyFromDiscount(0.03)).toBe(0);
        expect(apyFromDiscount(0)).toBe(0);
        expect(bondEquivalentYield(-0.1)).toBe(0);
    });

    it('compounds daily: three one-day credits equal one three-day lump', () => {
        const apy = apyFromDiscount(4.07);
        const threeDaily = (1 + dailyFactor(apy)) ** 3 - 1;
        expect(threeDaily).toBeCloseTo((1 + apy) ** (3 / 365) - 1, 14);
    });

    it('reads the latest rate on or before a day — forward-filled, never from the future', () => {
        const rateOn = makeRateLookup([{date: '2026-09-18', discountPct: 4.0}, {date: '2026-09-21', discountPct: 4.1}]);
        expect(rateOn('2026-09-17')).toBeNull();
        expect(rateOn('2026-09-19')?.discountPct).toBe(4.0);   // Saturday: Friday's rate
        expect(rateOn('2026-09-21')?.discountPct).toBe(4.1);
    });
});

describe('interestOverDays', () => {
    // The ticket's "earning ≈$x/month" is this, so it must be what the clock would credit.
    it('is exactly what the clock credits over those nights at a constant rate, with no trades', () => {
        const {rows} = replayIncome({
            from: '2026-09-01', to: '2026-09-30', startCash: 94_700, startHoldings: new Map(), trades: [], clock: clockWith(),
        });
        const credited = rows.reduce((sum, r) => sum + r.amount, 0);
        expect(rows).toHaveLength(30);
        expect(interestOverDays(94_700, apyFromDiscount(4.07), 30)).toBeCloseTo(credited, 9);
    });

    it('compounds daily: 30 days is (1 + APY)^(30/365) − 1 of the cash', () => {
        expect(interestOverDays(94_700, 0.0392, 30)).toBeCloseTo(94_700 * ((1.0392) ** (30 / 365) - 1), 9);
        expect(interestOverDays(94_700, 0.0392, 30)).toBeCloseTo(299.76, 2);
    });

    it('is zero, never negative, for no cash, no days or a zero rate', () => {
        expect(interestOverDays(0, 0.0392, 30)).toBe(0);
        expect(interestOverDays(-500, 0.0392, 30)).toBe(0);
        expect(interestOverDays(94_700, 0.0392, 0)).toBe(0);
        expect(interestOverDays(94_700, 0, 30)).toBe(0);
    });
});

describe('replayIncome', () => {
    it('accrues on end-of-day cash and credits it at the next open, so it compounds', () => {
        const {rows, cash} = replayIncome({
            from: '2026-09-18', to: '2026-09-20', startCash: 100_000, startHoldings: new Map(), trades: [], clock: clockWith(),
        });
        const f = dailyFactor(apyFromDiscount(4.07));

        expect(rows.map((r) => r.date)).toEqual(['2026-09-18', '2026-09-19', '2026-09-20']);
        expect(rows[0].amount).toBeCloseTo(100_000 * f, 10);
        expect(rows[1].amount).toBeCloseTo(100_000 * (1 + f) * f, 10);
        // The last day's interest lands at the next open, so it is not in end-of-day cash yet.
        expect(cash).toBeCloseTo(100_000 * (1 + f) ** 2, 8);
    });

    it('lets a trade move only the days from its own onwards', () => {
        const {rows} = replayIncome({
            from: '2026-09-18', to: '2026-09-19', startCash: 100_000, startHoldings: new Map(),
            trades: [trade('2026-09-19', 'SPY', 'buy', 100, 600)], clock: clockWith(),
        });
        const f = dailyFactor(apyFromDiscount(4.07));
        expect(rows[0].amount).toBeCloseTo(100_000 * f, 10);
        expect(rows[1].amount).toBeCloseTo((100_000 * (1 + f) - 60_000) * f, 10);
    });

    const XLE_DIVIDEND: DividendPoint[] = [{symbol: 'XLE', exDate: '2026-09-21', perShare: 0.38}];

    it('pays a dividend on the holdings at the end of the day before the ex-date, five days later', () => {
        const {rows} = replayIncome({
            from: '2026-09-18', to: '2026-09-30', startCash: 0, startHoldings: new Map(),
            trades: [trade('2026-09-18', 'XLE', 'buy', 100, 0)], clock: clockWith(XLE_DIVIDEND, []),
        });
        expect(payDateFor('2026-09-21')).toBe('2026-09-26');
        expect(rows).toEqual([{kind: 'dividend', date: '2026-09-26', symbol: 'XLE', amount: 38, exDate: '2026-09-21', perShare: 0.38, quantity: 100}]);
    });

    it('does not entitle a buy on the ex-date, and does entitle a sell on it', () => {
        const bought = replayIncome({
            from: '2026-09-18', to: '2026-09-30', startCash: 0, startHoldings: new Map(),
            trades: [trade('2026-09-21', 'XLE', 'buy', 100, 0)], clock: clockWith(XLE_DIVIDEND, []),
        });
        const sold = replayIncome({
            from: '2026-09-18', to: '2026-09-30', startCash: 0, startHoldings: new Map([['XLE', 100]]),
            trades: [trade('2026-09-21', 'XLE', 'sell', 100, 0)], clock: clockWith(XLE_DIVIDEND, []),
        });
        expect(bought.rows).toEqual([]);
        expect(sold.rows.map((r) => r.amount)).toEqual([38]);
    });

    // History moves cash by what the account actually received; recomputing it from today's
    // data could differ and would make every later day wrong.
    it('replays already-credited days with the stored amounts', () => {
        const {rows} = replayIncome({
            from: '2026-09-18', to: '2026-09-19', startCash: 100_000, startHoldings: new Map(), trades: [], clock: clockWith(),
            credited: (date) => (date === '2026-09-18' ? 5 : undefined),
        });
        expect(rows[1].amount).toBeCloseTo(100_005 * dailyFactor(apyFromDiscount(4.07)), 10);
    });

    it('credits nothing for an empty window or an empty account', () => {
        expect(replayIncome({from: '2026-09-20', to: '2026-09-19', startCash: 1, startHoldings: new Map(), trades: [], clock: clockWith()}).rows).toEqual([]);
        expect(replayIncome({from: '2026-09-18', to: '2026-09-19', startCash: 0, startHoldings: new Map(), trades: [], clock: clockWith()}).rows).toEqual([]);
    });
});

describe('reconcile', () => {
    const trades = [trade('2026-09-18', 'SPY', 'buy', 10, 600), trade('2026-09-19', 'SPY', 'sell', 4, 610)];

    it('accepts an account that is exactly its starting balance, trades and credits', () => {
        expect(reconcile({startingBalance: 100_000, cash: 100_000 - 6_000 + 2_440 + 12.5, positions: [{symbol: 'SPY', quantity: 6}], trades, creditedTotal: 12.5}))
            .toEqual({ok: true});
    });

    it('rejects missing history instead of compounding it', () => {
        expect(reconcile({startingBalance: 100_000, cash: 97_000, positions: [{symbol: 'SPY', quantity: 6}], trades, creditedTotal: 0}).ok).toBe(false);
        expect(reconcile({startingBalance: 100_000, cash: 96_440, positions: [{symbol: 'SPY', quantity: 5}], trades, creditedTotal: 0}).ok).toBe(false);
    });
});

describe('holdingSpans', () => {
    it('spans first buy to the day a position went flat, open while held', () => {
        expect(holdingSpans([
            trade('2026-09-01', 'SPY', 'buy', 10, 1), trade('2026-09-10', 'SPY', 'sell', 10, 1),
            trade('2026-09-05', 'XLE', 'buy', 5, 1),
        ])).toEqual([
            {symbol: 'SPY', firstHeld: '2026-09-01', lastHeld: '2026-09-10'},
            {symbol: 'XLE', firstHeld: '2026-09-05', lastHeld: null},
        ]);
    });
});

// One staleness rule for every reader of the rate: the job's watermark (readyThrough) and the
// APY the Income panel and the ticket quote (account.getCashApy) agree on when it stops counting.
describe('usableRate', () => {
    const point = {date: '2026-09-10', discountPct: 4.07};

    it('is the point while it is at most a week old', () => {
        expect(RATE_MAX_STALENESS_DAYS).toBe(7);
        expect(usableRate(point, '2026-09-10')).toBe(point);
        expect(usableRate(point, '2026-09-17')).toBe(point);
    });

    it('is null once it is older than that, and null without a point', () => {
        expect(usableRate(point, '2026-09-18')).toBeNull();
        expect(usableRate(null, '2026-09-10')).toBeNull();
    });

    it('is the rule readyThrough holds the watermark with', () => {
        const rateOn = makeRateLookup([point]);
        const ready = readyThrough({start: '2026-09-11', end: '2026-09-30', rateOn, spans: [], coverage: () => null, released: new Set<string>()});
        expect(ready).toBe('2026-09-17');
        expect(usableRate(rateOn(ready as string), ready as string)).toBe(point);
        expect(usableRate(rateOn('2026-09-18'), '2026-09-18')).toBeNull();
    });
});

describe('readyThrough', () => {
    // A daily series, like the real ^IRX, ending on the given day.
    const dailyRates = (through: string): RatePoint[] => {
        const points: RatePoint[] = [];
        for (let d = new Date('2026-08-15T00:00:00Z'); d.toISOString().slice(0, 10) <= through; d.setUTCDate(d.getUTCDate() + 1)) {
            points.push({date: d.toISOString().slice(0, 10), discountPct: 4});
        }
        return points;
    };
    const rateOn = makeRateLookup(dailyRates('2026-09-10'));
    const base = {start: '2026-09-01', end: '2026-09-24', rateOn, spans: [], coverage: () => null, released: new Set<string>()};

    it('stops the day before the rate goes stale', () => {
        // 09-10 is the last rate: stale once a day is more than seven days past it.
        expect(readyThrough(base)).toBe('2026-09-17');
    });

    it('is not ready at all without a rate', () => {
        expect(readyThrough({...base, rateOn: makeRateLookup([])})).toBeNull();
    });

    const fresh = makeRateLookup(dailyRates('2026-09-23'));

    it('refuses to credit across a gap in the rate series longer than a week', () => {
        const gapped = makeRateLookup([...dailyRates('2026-09-02'), {date: '2026-09-15', discountPct: 4}]);
        expect(readyThrough({...base, rateOn: gapped})).toBe('2026-09-09');
    });
    const xle = [{symbol: 'XLE', firstHeld: '2026-08-20', lastHeld: null}];

    it('holds back to the day before the first pay date it cannot vouch for', () => {
        // Ex-dates from 08-27 can pay inside the window; with no coverage the first of them,
        // paid 09-01, is already unknown — nothing is ready.
        expect(readyThrough({...base, rateOn: fresh, spans: xle})).toBeNull();
    });

    it('stops at the covered ex-dates plus the pay lag', () => {
        expect(readyThrough({...base, rateOn: fresh, spans: xle, coverage: () => ({from: '2021-01-01', through: '2026-09-15'})})).toBe('2026-09-20');
        expect(readyThrough({...base, rateOn: fresh, spans: xle, coverage: () => ({from: '2021-01-01', through: '2026-09-23'})})).toBe('2026-09-24');
    });

    it('ignores symbols released after a month of failures, and positions closed before the window', () => {
        expect(readyThrough({...base, rateOn: fresh, spans: xle, released: new Set(['XLE'])})).toBe('2026-09-24');
        expect(readyThrough({...base, rateOn: fresh, spans: [{symbol: 'XLE', firstHeld: '2026-06-01', lastHeld: '2026-07-01'}]})).toBe('2026-09-24');
    });
});

describe('describeIncomeRun', () => {
    it('leads with what was credited and names every account that was not', () => {
        const line = describeIncomeRun([
            {accountId: 'aaaaaa111111', status: 'credited', amount: 10.5},
            {accountId: 'bbbbbb222222', status: 'credited', amount: 2.25},
            {accountId: 'cccccc333333', status: 'current'},
            {accountId: 'dddddd444444', status: 'skipped', reason: 'cash 1.00 ≠ 2.00 rebuilt from trades'},
        ], '2026-09-24');
        expect(line).toBe('Income through 2026-09-24: 2 account(s) credited $12.75 · 1 already current · 1 skipped: 444444 (cash 1.00 ≠ 2.00 rebuilt from trades)');
    });
});

describe('groupIncomeActivity', () => {
    const rows = [
        {kind: 'interest' as const, date: '2026-08-31', symbol: '', amount: 10, apy: 0.04},
        {kind: 'interest' as const, date: '2026-09-01', symbol: '', amount: 11, apy: 0.04},
        {kind: 'interest' as const, date: '2026-09-02', symbol: '', amount: 12, apy: 0.042},
        {kind: 'dividend' as const, date: '2026-09-23', symbol: 'SPY', amount: 18.89, exDate: '2026-09-18', perShare: 1.889, quantity: 10},
        {kind: 'dividend' as const, date: '2026-09-26', symbol: 'XLE', amount: 38, exDate: '2026-09-21', perShare: 0.38, quantity: 100},
    ];

    it('collapses daily interest into one line a month, newest first, with the average rate', () => {
        const {interestByMonth} = groupIncomeActivity(rows);
        expect(interestByMonth.map((m) => [m.month, m.amount, m.days])).toEqual([['2026-09', 23, 2], ['2026-08', 10, 1]]);
        expect(interestByMonth[0].averageApy).toBeCloseTo(0.041, 12);
    });

    it('lists dividends one by one, newest first, capped', () => {
        const {dividends} = groupIncomeActivity(rows, {dividends: 1});
        expect(dividends).toEqual([{date: '2026-09-26', exDate: '2026-09-21', symbol: 'XLE', quantity: 100, perShare: 0.38, amount: 38}]);
    });

    it('is empty for an account with no income yet', () => {
        expect(groupIncomeActivity([])).toEqual({interestByMonth: [], dividends: []});
    });
});
