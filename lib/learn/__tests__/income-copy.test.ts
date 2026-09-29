// The Income panel's receipts. Each interest month is recomputed from what it prints —
// average cash × dailyFactor(APY) × days — over rows the one accrual convention produced,
// and must land on the stored sum to the cent (invariant 11). Every sentence is held to the
// no-advice list at the 'copy' tier.

import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {GLOSSARY} from '@/lib/learn/glossary';
import {
    INCOME_COPY,
    dividendReceipt,
    dividendSummary,
    interestReceipt,
    interestSummary,
    missedLine,
    monthLabel,
    rateMovedNote,
} from '@/lib/learn/copy/income';
import {
    CASH_YIELD_SPREAD,
    apyFromDiscount,
    bondEquivalentYield,
    createIncomeClock,
    dailyFactor,
    dividendsByExDate,
    groupIncomeActivity,
    makeRateLookup,
    replayIncome,
    withReceipts,
    type IncomeMonth,
    type IncomeTrade,
    type LedgerFill,
} from '@/lib/trading/income';

const cents = (amount: number): number => Math.round(amount * 100);
const dollars = (printed: string): number => Number(printed.replace(/[$,]/g, ''));

// The receipt as a reader sees it: its printed operands, multiplied back, and its printed total,
// both in cents. Null when the line is not the average-cash receipt.
const RECEIPT = /^average cash (\$[\d,]+\.\d{2}) × (\d+\.\d{6,12})%\/day \(\(1 \+ \d+\.\d{2}%\)\^\(1\/365\) − 1\) × (\d+) days? = (\$[\d,]+\.\d{2})$/;
const readReceipt = (line: string): {product: number; total: number} | null => {
    const m = RECEIPT.exec(line);
    return m ? {product: cents(dollars(m[1]) * (Number(m[2]) / 100) * Number(m[3])), total: cents(dollars(m[4]))} : null;
};
const at = (date: string): number => Date.parse(`${date}T16:00:00Z`);

const month = (over: Partial<IncomeMonth>): IncomeMonth => ({
    month: '2026-09', amount: 61_300 * dailyFactor(0.0392) * 24, days: 24, averageApy: 0.0392,
    averageCash: 61_300, cashWeightedApy: 0.0392, minApy: 0.0392, maxApy: 0.0392, ...over,
});

describe('interestReceipt', () => {
    it('prints the daily factor, never a division by 365', () => {
        const line = interestReceipt(month({}));
        expect(line).toBe('average cash $61,300.00 × 0.010535%/day ((1 + 3.92%)^(1/365) − 1) × 24 days = $154.99');
        expect(line).not.toMatch(/÷/);
        // 365 appears once, as the exponent of the daily factor.
        expect(line.split('^(1/365)').join('')).not.toMatch(/365/);
    });

    it('falls back to the per-day rule when a month cannot rebuild its cash', () => {
        expect(interestReceipt(month({averageCash: null, cashWeightedApy: null, days: 1, amount: 10})))
            .toBe('1 daily credit, each day\'s closing cash × ((1 + that day\'s APY)^(1/365) − 1) = $10.00');
    });

    // Rows from the clock: a rate that steps mid-month under a balance that moves twice, and a
    // second month at a steady rate on a compounding balance.
    const rates = [{date: '2026-08-25', discountPct: 4.0}, {date: '2026-09-16', discountPct: 4.6}, {date: '2026-10-01', discountPct: 4.07}];
    const trades: IncomeTrade[] = [
        {date: '2026-09-10', symbol: 'SPY', side: 'buy', quantity: 60, total: 60_000},
        {date: '2026-09-24', symbol: 'SPY', side: 'sell', quantity: 20, total: 20_400},
        {date: '2026-10-12', symbol: 'SPY', side: 'buy', quantity: 10, total: 10_300},
    ];
    const {rows} = replayIncome({
        from: '2026-09-01', to: '2026-10-31', startCash: 100_000, startHoldings: new Map(), trades,
        clock: createIncomeClock({rateOn: makeRateLookup(rates), dividends: new Map()}),
    });
    const months = groupIncomeActivity(rows).interestByMonth;

    it('recomputes every stored month to the cent from the numbers it prints', () => {
        expect(months.map((m) => m.month)).toEqual(['2026-10', '2026-09']);
        for (const m of months) {
            const stored = rows.filter((r) => r.kind === 'interest' && r.date.startsWith(m.month)).reduce((s, r) => s + r.amount, 0);
            const printed = readReceipt(interestReceipt(m));
            expect(printed, m.month).not.toBeNull();
            expect(printed?.product, m.month).toBe(cents(stored));
            expect(printed?.total, m.month).toBe(cents(stored));
        }
    });

    // credited → 0 keeps interest out of cash, so the end-of-day cash is known by hand:
    // 100,000 for Sep 1–9, 40,000 from the 60,000 buy on Sep 10 — an average of 58,000.
    it('prints the average cash the account really held', () => {
        const {rows: flat} = replayIncome({
            from: '2026-09-01', to: '2026-09-30', startCash: 100_000, startHoldings: new Map(),
            trades: [{date: '2026-09-10', symbol: 'SPY', side: 'buy', quantity: 60, total: 60_000}],
            clock: createIncomeClock({rateOn: makeRateLookup(rates), dividends: new Map()}), credited: () => 0,
        });
        const [september] = groupIncomeActivity(flat).interestByMonth;
        expect((9 * 100_000 + 21 * 40_000) / 30).toBe(58_000);
        expect(interestReceipt(september)).toMatch(/^average cash \$58,000\.00 × /);
        expect(readReceipt(interestReceipt(september))?.product).toBe(cents(flat.reduce((s, r) => s + r.amount, 0)));
    });

    it('says when the rate moved, and names the weighting, only then', () => {
        const [october, september] = months;
        expect(rateMovedNote(october)).toBeNull();
        expect(rateMovedNote(september)).toBe(`The rate moved between ${(apyFromDiscount(4.0) * 100).toFixed(2)}% and ${(apyFromDiscount(4.6) * 100).toFixed(2)}% APY this month; ${((september.cashWeightedApy as number) * 100).toFixed(2)}% is the rate weighted by the cash that earned it, the one rate that gives the same total.`);
        expect(interestSummary(september)).toBe(`30 days · ${((september.cashWeightedApy as number) * 100).toFixed(2)}% APY`);
        expect(monthLabel('2026-09')).toBe('September 2026');
    });
});

// A reader who multiplies the receipt's printed numbers must land on its printed total. Over a
// grid of balances ($1k–$1M), month lengths (28–31 days) and rates (≈0–6% APY, steady and
// stepping mid-month), each month replayed by the clock itself: zero receipts off by a cent.
describe('every interest receipt multiplies back from what it prints', () => {
    const cashes = [1_000, 1_234.56, 5_000, 12_345.67, 61_300, 99_999.99, 250_000, 512_345.12, 777_777.77, 1_000_000];
    const discounts = Array.from({length: 61}, (_, i) => 0.3 + i * 0.1);

    it('to the cent, on every one', () => {
        const misses: string[] = [];
        let checked = 0;
        for (const cash of cashes) {
            for (let days = 28; days <= 31; days += 1) {
                for (const discount of discounts) {
                    for (const stepping of [false, true]) {
                        const rates = [{date: '2026-09-25', discountPct: discount}, ...(stepping ? [{date: '2026-10-16', discountPct: discount * 1.2}] : [])];
                        const {rows} = replayIncome({
                            from: '2026-10-01', to: `2026-10-${days}`, startCash: cash, startHoldings: new Map(), trades: [],
                            clock: createIncomeClock({rateOn: makeRateLookup(rates), dividends: new Map()}),
                        });
                        const [m] = groupIncomeActivity(rows).interestByMonth;
                        const stored = cents(rows.reduce((sum, r) => sum + r.amount, 0));
                        const line = interestReceipt(m);
                        const printed = readReceipt(line);
                        checked += 1;
                        if (printed === null || printed.product !== stored || printed.total !== stored) misses.push(`${line} (stored ${stored}¢)`);
                    }
                }
            }
        }
        expect(checked).toBe(cashes.length * 4 * discounts.length * 2);
        expect(misses.slice(0, 5)).toEqual([]);
        expect(misses).toHaveLength(0);
    });

    it('prints the daily rate to six decimals when six already multiply back', () => {
        expect(interestReceipt(month({}))).toContain('× 0.010535%/day');
    });
});

describe('dividend receipts', () => {
    const ledger: LedgerFill[] = [
        {symbol: 'SPY', side: 'buy', quantity: 10, createdAt: at('2026-09-03')},
        {symbol: 'XLE', side: 'buy', quantity: 20, createdAt: at('2026-09-21')},
        {symbol: 'AGG', side: 'buy', quantity: 5, createdAt: at('2026-09-02')},
        {symbol: 'AGG', side: 'sell', quantity: 5, createdAt: at('2026-09-18')},
    ];
    const points = [
        {symbol: 'SPY', exDate: '2026-09-18', perShare: 1.889},
        {symbol: 'XLE', exDate: '2026-09-21', perShare: 0.26},
        {symbol: 'AGG', exDate: '2026-09-21', perShare: 0.3},
    ];
    const {rows} = replayIncome({
        from: '2026-09-01', to: '2026-09-30', startCash: 0, startHoldings: new Map(),
        trades: [
            {date: '2026-09-03', symbol: 'SPY', side: 'buy', quantity: 10, total: 0},
            {date: '2026-09-21', symbol: 'XLE', side: 'buy', quantity: 20, total: 0},
            {date: '2026-09-02', symbol: 'AGG', side: 'buy', quantity: 5, total: 0},
            {date: '2026-09-18', symbol: 'AGG', side: 'sell', quantity: 5, total: 0},
        ],
        clock: createIncomeClock({rateOn: makeRateLookup([]), dividends: dividendsByExDate(points)}),
    });
    const view = withReceipts(groupIncomeActivity(rows), ledger, points);

    it('reproduces the paid row to the cent, with the day that decided it', () => {
        expect(view.dividends).toHaveLength(1);
        const [spy] = view.dividends;
        expect(dividendSummary(spy)).toBe('10 × $1.889 · paid Sep 23');
        expect(dividendReceipt(spy.receipt!)).toBe('10 shares held at the close on Sep 17, the day before the Sep 18 ex-date (held since Sep 3) · 10 × $1.889 = $18.89 · paid Sep 23, 5 days after the ex-date');
        expect(cents((spy.quantity as number) * (spy.perShare as number))).toBe(cents(rows[0].amount));
    });

    it('reads a missed ex-date from either side', () => {
        expect(view.missed.map(missedLine)).toEqual([
            'Sold 5 AGG on Sep 18, the session before its Sep 21 ex-date: a day early for $0.30 a share ($1.50).',
            'Bought 20 XLE on Sep 21, its ex-dividend date: a day late for $0.26 a share ($5.20).',
        ]);
    });

    it('keeps the summary to the date when a row has no share count', () => {
        expect(dividendSummary({date: '2026-09-23', exDate: null, symbol: 'SPY', quantity: null, perShare: null, amount: 18.89})).toBe('paid Sep 23');
    });

    it('never advises, on any line', () => {
        const lines = [
            ...Object.values(INCOME_COPY),
            ...view.dividends.flatMap((d) => [dividendSummary(d), d.receipt ? dividendReceipt(d.receipt) : '']),
            ...view.missed.map(missedLine),
            interestReceipt(month({})), interestReceipt(month({averageCash: null, cashWeightedApy: null})),
            interestSummary(month({})), rateMovedNote(month({minApy: 0.03, maxApy: 0.05})) ?? '',
        ];
        for (const line of lines) expect(findBanned(line, 'copy'), line).toEqual([]);
    });
});

describe('the rate conversion the panel defines', () => {
    const entry = GLOSSARY['bond-equivalent-yield'];

    it('states the spread and today\'s example from the code that computes them', () => {
        expect(entry.formula).toContain(`${(CASH_YIELD_SPREAD * 100).toFixed(2)}%`);
        expect(entry.long).toContain(`${(bondEquivalentYield(4.07) * 100).toFixed(2)}%`);
        expect(entry.long).toContain(`${(apyFromDiscount(4.07) * 100).toFixed(2)}%`);
        expect(entry.long).toContain(`${(CASH_YIELD_SPREAD * 100).toFixed(2)}%`);
    });
});
