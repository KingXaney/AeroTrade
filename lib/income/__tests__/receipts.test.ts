// The Income panel's receipts: every number they print must come back out of the one accrual
// convention (lib/trading/income.ts). Rows here are produced by replayIncome itself, so a
// receipt that drifted from what the clock credits fails against the clock, not a copy of it.

import {describe, expect, it} from 'vitest';
import {
    apyForDailyRate,
    apyFromDiscount,
    createIncomeClock,
    dailyFactor,
    dividendsByExDate,
    explainDividend,
    groupIncomeActivity,
    makeRateLookup,
    missedExDates,
    replayIncome,
    withReceipts,
    type DividendPoint,
    type IncomeTrade,
    type LedgerFill,
    type RatePoint,
} from '@/lib/trading/income';

// Noon in New York in September (EDT), so the Eastern date is the date written.
const at = (date: string): number => Date.parse(`${date}T16:00:00Z`);
const fill = (date: string, symbol: string, side: 'buy' | 'sell', quantity: number): LedgerFill => ({symbol, side, quantity, createdAt: at(date)});
const asTrade = (date: string, symbol: string, side: 'buy' | 'sell', quantity: number, price: number): IncomeTrade => ({date, symbol, side, quantity, total: quantity * price});
const cents = (amount: number): number => Math.round(amount * 100);

describe('interest by month: average cash and the one rate that reproduces it', () => {
    // 4.0% discount through the 15th, 4.6% after: the rate steps mid-month, as ^IRX does.
    const stepping: RatePoint[] = [{date: '2026-08-25', discountPct: 4.0}, {date: '2026-09-16', discountPct: 4.6}];
    const clock = () => createIncomeClock({rateOn: makeRateLookup(stepping), dividends: new Map()});

    // credited → 0 keeps interest out of cash, so the true end-of-day cash is known by hand:
    // 100,000 for 09-01..09-09, then 40,000 after a 60,000 buy on 09-10.
    const flat = replayIncome({
        from: '2026-09-01', to: '2026-09-30', startCash: 100_000, startHoldings: new Map(),
        trades: [asTrade('2026-09-10', 'SPY', 'buy', 60, 1_000)], clock: clock(), credited: () => 0,
    });
    const [september] = groupIncomeActivity(flat.rows).interestByMonth;

    it('rebuilds the month\'s average end-of-day cash from its rows', () => {
        expect(september.days).toBe(30);
        expect(september.averageCash).toBeCloseTo((9 * 100_000 + 21 * 40_000) / 30, 6);
    });

    it('reproduces the stored month to the cent: average cash × dailyFactor(apy) × days', () => {
        const {averageCash, cashWeightedApy, days, amount} = september;
        expect(averageCash).not.toBeNull();
        expect(cashWeightedApy).not.toBeNull();
        const rebuilt = (averageCash as number) * dailyFactor(cashWeightedApy as number) * days;
        expect(cents(rebuilt)).toBe(cents(amount));
        expect(Math.abs(rebuilt - amount)).toBeLessThan(1e-8);
    });

    it('needs the cash-weighted rate: a plain average of the days\' APYs misses by dollars', () => {
        const {averageCash, averageApy, days, amount} = september;
        const naive = (averageCash as number) * dailyFactor(averageApy as number) * days;
        expect(Math.abs(naive - amount)).toBeGreaterThan(1);
        expect(september.minApy).toBeCloseTo(apyFromDiscount(4.0), 12);
        expect(september.maxApy).toBeCloseTo(apyFromDiscount(4.6), 12);
        expect(september.cashWeightedApy as number).toBeGreaterThan(september.minApy as number);
        expect(september.cashWeightedApy as number).toBeLessThan(september.averageApy as number);
    });

    it('is the day\'s own APY when the rate held all month, on a compounding balance', () => {
        const steady = replayIncome({
            from: '2026-09-01', to: '2026-09-30', startCash: 100_000, startHoldings: new Map(),
            trades: [asTrade('2026-09-12', 'SPY', 'buy', 30, 1_000), asTrade('2026-09-20', 'SPY', 'sell', 10, 1_010)],
            clock: createIncomeClock({rateOn: makeRateLookup([{date: '2026-08-25', discountPct: 4.07}]), dividends: new Map()}),
        });
        const [month] = groupIncomeActivity(steady.rows).interestByMonth;
        expect(month.cashWeightedApy).toBeCloseTo(apyFromDiscount(4.07), 12);
        expect(month.minApy).toBe(month.maxApy);
        expect(cents((month.averageCash as number) * dailyFactor(month.cashWeightedApy as number) * month.days)).toBe(cents(month.amount));
    });

    it('inverts the daily factor', () => {
        expect(apyForDailyRate(dailyFactor(0.0392))).toBeCloseTo(0.0392, 12);
    });

    it('cannot rebuild cash from a row stored without its rate', () => {
        const [month] = groupIncomeActivity([
            {kind: 'interest', date: '2026-09-01', symbol: '', amount: 10, apy: 0.04},
            {kind: 'interest', date: '2026-09-02', symbol: '', amount: 10},
        ]).interestByMonth;
        expect(month.averageCash).toBeNull();
        expect(month.cashWeightedApy).toBeNull();
        expect(month.averageApy).toBe(0.04);
    });
});

// XLE: 100 held from 09-10; 50 more bought ON the 09-21 ex-date (a day late).
// SPY: 20 held from 09-01 and sold Friday 09-18, the session before a Monday ex-date.
// AGG: 5 of 10 sold Friday and bought back Saturday — still 10 at the close before; nothing missed.
const LEDGER: LedgerFill[] = [
    fill('2026-09-01', 'SPY', 'buy', 20),
    fill('2026-09-01', 'AGG', 'buy', 10),
    fill('2026-09-10', 'XLE', 'buy', 100),
    fill('2026-09-18', 'SPY', 'sell', 20),
    fill('2026-09-18', 'AGG', 'sell', 5),
    fill('2026-09-19', 'AGG', 'buy', 5),
    fill('2026-09-21', 'XLE', 'buy', 50),
];
const PRICES: Record<string, number> = {SPY: 600, AGG: 98, XLE: 90};
const tradesOf = (ledger: readonly LedgerFill[]): IncomeTrade[] => ledger.map((t) => asTrade(
    new Date(t.createdAt - 4 * 3_600_000).toISOString().slice(0, 10), t.symbol, t.side, t.quantity, PRICES[t.symbol],
));
const POINTS: DividendPoint[] = [
    {symbol: 'XLE', exDate: '2026-09-05', perShare: 0.35},   // before the first buy: nothing either way
    {symbol: 'XLE', exDate: '2026-09-21', perShare: 0.38},
    {symbol: 'SPY', exDate: '2026-09-21', perShare: 1.889},
    {symbol: 'AGG', exDate: '2026-09-21', perShare: 0.3},
];
const replayDividends = (ledger: readonly LedgerFill[]) => replayIncome({
    from: '2026-09-01', to: '2026-09-30', startCash: 0, startHoldings: new Map(), trades: tradesOf(ledger),
    clock: createIncomeClock({rateOn: makeRateLookup([]), dividends: dividendsByExDate(POINTS)}),
}).rows;

describe('explainDividend', () => {
    const rows = replayDividends(LEDGER);
    const {dividends} = groupIncomeActivity(rows);
    const xle = dividends.find((d) => d.symbol === 'XLE');
    const agg = dividends.find((d) => d.symbol === 'AGG');

    it('reads the shares held at the close before the ex-date, as the clock paid them', () => {
        expect(dividends.map((d) => d.symbol).sort()).toEqual(['AGG', 'XLE']);
        expect(explainDividend(xle!, LEDGER)).toEqual({
            symbol: 'XLE', exDate: '2026-09-21', closeBefore: '2026-09-20', payDate: '2026-09-26',
            quantity: 100, perShare: 0.38, amount: 38, heldSince: '2026-09-10',
        });
    });

    it('dates a holding from when it was last opened, through partial sells and buys', () => {
        expect(explainDividend(agg!, LEDGER)?.heldSince).toBe('2026-09-01');
    });

    it('does not claim a holding date the ledger cannot show', () => {
        expect(explainDividend(xle!, [])?.heldSince).toBeNull();
        expect(explainDividend(xle!, [])?.quantity).toBe(100);
    });

    it('has nothing to explain on a row stored without its ex-date or share count', () => {
        expect(explainDividend({date: '2026-09-26', exDate: null, symbol: 'XLE', quantity: null, perShare: null, amount: 38}, LEDGER)).toBeNull();
    });
});

describe('missedExDates', () => {
    const missed = missedExDates(LEDGER, POINTS);

    it('finds a buy on the ex-date and a sell the session before it, and nothing else', () => {
        expect(missed).toEqual([
            {symbol: 'SPY', exDate: '2026-09-21', perShare: 1.889, kind: 'sold-before-ex-date', tradeDate: '2026-09-18', quantity: 20, amount: 20 * 1.889},
            {symbol: 'XLE', exDate: '2026-09-21', perShare: 0.38, kind: 'bought-on-ex-date', tradeDate: '2026-09-21', quantity: 50, amount: 50 * 0.38},
        ]);
    });

    // The same trades a day the other way, run through the clock: exactly the missed amounts appear.
    it('matches what the clock pays when each trade moves by one day', () => {
        const shifted = LEDGER.map((t) => {
            if (t.symbol === 'XLE' && t.side === 'buy' && t.quantity === 50) return {...t, createdAt: at('2026-09-20')};
            if (t.symbol === 'SPY' && t.side === 'sell') return {...t, createdAt: at('2026-09-21')};
            return t;
        });
        const before = replayDividends(LEDGER);
        const after = replayDividends(shifted);
        const paid = (rows: typeof before, symbol: string) => rows.filter((r) => r.symbol === symbol && r.exDate === '2026-09-21').reduce((s, r) => s + r.amount, 0);
        expect(paid(after, 'XLE') - paid(before, 'XLE')).toBeCloseTo(missed[1].amount, 9);
        expect(paid(after, 'SPY') - paid(before, 'SPY')).toBeCloseTo(missed[0].amount, 9);
        expect(paid(after, 'AGG')).toBeCloseTo(paid(before, 'AGG'), 9);
    });

    it('lists the newest first and caps the list', () => {
        const many = missedExDates(
            [fill('2026-09-01', 'XLE', 'buy', 1), fill('2026-09-08', 'XLE', 'buy', 1), fill('2026-09-15', 'XLE', 'buy', 1)],
            ['2026-09-01', '2026-09-08', '2026-09-15'].map((exDate) => ({symbol: 'XLE', exDate, perShare: 0.1})),
            {limit: 2},
        );
        expect(many.map((m) => m.exDate)).toEqual(['2026-09-15', '2026-09-08']);
    });

    it('is empty with no trades or no dividends', () => {
        expect(missedExDates([], POINTS)).toEqual([]);
        expect(missedExDates(LEDGER, [])).toEqual([]);
    });
});

describe('withReceipts', () => {
    it('attaches a receipt to every dividend and the missed ex-dates to the panel', () => {
        const view = withReceipts(groupIncomeActivity(replayDividends(LEDGER)), LEDGER, POINTS);
        expect(view.dividends.every((d) => d.receipt !== null && d.receipt.amount === d.amount)).toBe(true);
        expect(view.missed.map((m) => m.symbol)).toEqual(['SPY', 'XLE']);
        expect(view.interestByMonth).toEqual([]);
    });
});
