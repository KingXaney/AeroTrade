// The Income panel on /portfolio: what the account earned without trading, and a receipt for
// each number. Interest is printed with the daily factor the accrual convention uses
// (lib/trading/income.ts dailyFactor), never as "÷ 365", so the arithmetic on screen is the
// arithmetic that credited the cash. Every sentence describes; none says what to do. Held to
// the no-advice list, and each printed receipt multiplied back to its cent, by
// lib/learn/__tests__/income-copy.test.ts.
//
// Import-free of server code: IncomeActivity renders it on the server today, and nothing
// here would stop a client panel reusing it.

import {shortDate} from "@/lib/learn/copy/portfolio";
import {addCalendarDays} from "@/lib/prices/calendar-days";
import {dailyFactor, type DividendReceipt, type IncomeActivity, type IncomeMonth, type MissedExDate} from "@/lib/trading/income";

const MONEY = new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2});
// Dividends are declared to the tenth of a cent and beyond; printing $1.89 for $1.889 would
// make "10 × $1.89" disagree with the $18.89 beside it.
const PER_SHARE = new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 6});
const QUANTITY = new Intl.NumberFormat('en-US', {maximumFractionDigits: 4});

const money = (amount: number): string => MONEY.format(amount);
const perShare = (amount: number): string => PER_SHARE.format(amount);
const qty = (n: number): string => QUANTITY.format(n);
const plural = (n: number, one: string, many: string): string => `${qty(n)} ${n === 1 ? one : many}`;
const apyPct = (apy: number): string => `${(apy * 100).toFixed(2)}%`;

export const INCOME_COPY = {
    emptyTitle: 'No income yet',
    emptyDescription: 'Idle cash earns interest at the 13-week T-bill rate, credited each night. A dividend is paid five days after a holding goes ex-dividend.',
    interestHeading: 'Interest on cash',
    dividendsHeading: 'Dividends',
    noDividends: 'None yet — a holding pays after its ex-dividend date.',
    missedHeading: 'Missed by a day',
} as const;

// '2026-09' → 'September 2026'
export const monthLabel = (month: string): string =>
    new Date(`${month}-01T12:00:00Z`).toLocaleDateString('en-US', {month: 'long', year: 'numeric', timeZone: 'UTC'});

// The APY a month is described by: the one its receipt multiplies by, when there is a receipt.
const monthApy = (m: IncomeMonth): number | null => m.cashWeightedApy ?? m.averageApy;

// '24 days · 3.92% APY'
export const interestSummary = (m: IncomeMonth): string => {
    const apy = monthApy(m);
    return `${plural(m.days, 'day', 'days')}${apy !== null ? ` · ${apyPct(apy)} APY` : ''}`;
};

// The daily rate is printed to the fewest decimals of a percent, from six up to twelve, at
// which the receipt's own printed numbers — the cash to the cent, the rate, the days —
// multiply back to its printed total's cent: a reader checking it by hand lands on the stored
// sum, not a cent or fifteen away. Six is enough for most months; a million dollars needs more.
const RATE_DECIMALS = {min: 6, max: 12} as const;
const printedDollars = (amount: number): number => Number(money(amount).replace(/[$,]/g, ''));
const multipliesBack = (cash: number, pct: string, days: number, total: number): boolean =>
    Math.round(cash * (Number(pct) / 100) * days * 100) === Math.round(total * 100);

const printedDailyRate = (averageCash: number, apy: number, days: number, amount: number): string => {
    const cash = printedDollars(averageCash);
    const total = printedDollars(amount);
    // The convention's daily factor first. In the rare month where rounding the cash to the
    // cent alone moves the product across a cent, the rate that printed cash earned
    // (total ÷ cash ÷ days) — the same factor to every digit that matters — is printed instead.
    const candidates = [dailyFactor(apy), cash > 0 && days > 0 ? total / (cash * days) : null];
    for (const rate of candidates) {
        if (rate === null) continue;
        for (let decimals: number = RATE_DECIMALS.min; decimals <= RATE_DECIMALS.max; decimals += 1) {
            const pct = (rate * 100).toFixed(decimals);
            if (multipliesBack(cash, pct, days, total)) return pct;
        }
    }
    return (dailyFactor(apy) * 100).toFixed(RATE_DECIMALS.max);
};

// 'average cash $61,300.00 × 0.010535%/day ((1 + 3.92%)^(1/365) − 1) × 24 days = $154.99'
export const interestReceipt = (m: IncomeMonth): string => {
    if (m.averageCash === null || m.cashWeightedApy === null) {
        return `${plural(m.days, 'daily credit', 'daily credits')}, each day's closing cash × ((1 + that day's APY)^(1/365) − 1) = ${money(m.amount)}`;
    }
    const perDay = `${printedDailyRate(m.averageCash, m.cashWeightedApy, m.days, m.amount)}%`;
    return `average cash ${money(m.averageCash)} × ${perDay}/day ((1 + ${apyPct(m.cashWeightedApy)})^(1/365) − 1) × ${plural(m.days, 'day', 'days')} = ${money(m.amount)}`;
};

// Only when the rate visibly moved: otherwise the month's rate is every day's rate.
export const rateMovedNote = (m: IncomeMonth): string | null => {
    if (m.minApy === null || m.maxApy === null || m.cashWeightedApy === null) return null;
    if (apyPct(m.minApy) === apyPct(m.maxApy)) return null;
    return `The rate moved between ${apyPct(m.minApy)} and ${apyPct(m.maxApy)} APY this month; ${apyPct(m.cashWeightedApy)} is the rate weighted by the cash that earned it, the one rate that gives the same total.`;
};

// '10 × $1.889 · paid Sep 23'
export const dividendSummary = (d: IncomeActivity['dividends'][number]): string =>
    `${d.quantity !== null && d.perShare !== null ? `${qty(d.quantity)} × ${perShare(d.perShare)} · ` : ''}paid ${shortDate(d.date)}`;

const daysBetween = (from: string, to: string): number => {
    let days = 0;
    for (let day = from; day < to && days < 366; day = addCalendarDays(day, 1)) days += 1;
    return days;
};

// '10 shares held at the close on Sep 17, the day before the Sep 18 ex-date (held since Sep 3)
//  · 10 × $1.889 = $18.89 · paid Sep 23, 5 days after the ex-date'
export const dividendReceipt = (r: DividendReceipt): string => [
    `${plural(r.quantity, 'share', 'shares')} held at the close on ${shortDate(r.closeBefore)}, the day before the ${shortDate(r.exDate)} ex-date${r.heldSince ? ` (held since ${shortDate(r.heldSince)})` : ''}`,
    `${qty(r.quantity)} × ${perShare(r.perShare)} = ${money(r.amount)}`,
    `paid ${shortDate(r.payDate)}, ${plural(daysBetween(r.exDate, r.payDate), 'day', 'days')} after the ex-date`,
].join(' · ');

export const missedLine = (m: MissedExDate): string => (m.kind === 'bought-on-ex-date'
    ? `Bought ${qty(m.quantity)} ${m.symbol} on ${shortDate(m.tradeDate)}, its ex-dividend date: a day late for ${perShare(m.perShare)} a share (${money(m.amount)}).`
    : `Sold ${qty(m.quantity)} ${m.symbol} on ${shortDate(m.tradeDate)}, the session before its ${shortDate(m.exDate)} ex-date: a day early for ${perShare(m.perShare)} a share (${money(m.amount)}).`);
