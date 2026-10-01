// A total-return index — price plus reinvested dividends — chained over stored bars.
//
// Built from `close + dividend` rather than from adjClose because stored adjCloses mix
// download dates, and Yahoo rebases every one of them on each new distribution; a ratio
// across two vintages would be wrong. Chaining plain closes and stored dividend amounts is
// immune to that.
//
// Dividends enter on the same timetable accounts are paid on (lib/income/accrual.ts): paid
// DIVIDEND_PAY_LAG_DAYS after the ex-date, as cash at the start of the following day. So a
// paper account holding only SPY crosses every ex-date in step with this index, instead of
// showing a gap of one quarterly dividend for a week.

import {DIVIDEND_PAY_LAG_DAYS} from "@/lib/prices/config";
import {addCalendarDays} from "@/lib/prices/calendar-days";
import type {Bar} from "@/lib/prices/signals";

export type IndexPoint = {date: string; value: number};

export const totalReturnIndex = (bars: readonly Bar[]): IndexPoint[] => {
    if (bars.length === 0) return [];
    const reinvested = new Array<number>(bars.length).fill(0);
    bars.forEach((bar, i) => {
        if (!(typeof bar.dividend === 'number' && bar.dividend > 0)) return;
        const paid = addCalendarDays(bar.date, DIVIDEND_PAY_LAG_DAYS);
        // First session strictly after the pay date: the day the cash is in the account.
        let j = i + 1;
        while (j < bars.length && bars[j].date <= paid) j += 1;
        if (j < bars.length) reinvested[j] += bar.dividend;
    });
    // value_t = close_t × F_t, where F only moves when a dividend is reinvested:
    // F_t = F_{t−1} × (1 + paid_t / close_t). The same chain as
    // value_{t−1} × (close_t + paid_t) / close_{t−1}, but exactly the closes when nothing is
    // paid, instead of drifting away from them through a long product of ratios.
    let factor = 1;
    return bars.map((bar, i) => {
        if (reinvested[i] > 0) factor *= 1 + reinvested[i] / bar.close;
        return {date: bar.date, value: bar.close * factor};
    });
};

// The intraday leg: stored bars end at the previous session, so today's value is the last
// point moved by the live quote. Keeps a live "vs SPY" on the same basis as the history.
export const extendWithQuote = (index: readonly IndexPoint[], lastClose: number, quote: number | undefined): number | null => {
    const last = index[index.length - 1];
    if (last === undefined) return null;
    if (typeof quote !== 'number' || !(quote > 0) || !(lastClose > 0)) return last.value;
    return last.value * quote / lastClose;
};

// Return between two dates on the index: the base is the first point on or after `from`,
// the end the last point on or before `to`.
export const indexReturnPct = (index: readonly IndexPoint[], from: string, to: string): number | null => {
    const base = index.find((p) => p.date >= from);
    const end = [...index].reverse().find((p) => p.date <= to);
    if (base === undefined || end === undefined || !(base.value > 0) || end.date < base.date) return null;
    return (end.value / base.value - 1) * 100;
};

// The index with today's point appended from the live quote — stored bars end at the previous
// session, and without this a chart compares today's account with yesterday's SPY.
export const appendLive = (index: readonly IndexPoint[], lastClose: number | null, quote: number | undefined, today: string): IndexPoint[] => {
    const last = index[index.length - 1];
    if (last === undefined || last.date >= today || lastClose === null) return [...index];
    const value = extendWithQuote(index, lastClose, quote);
    return value === null || value === last.value ? [...index] : [...index, {date: today, value}];
};
