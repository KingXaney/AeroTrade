// Rebalance cadence and trading-day helpers. Pure.
//
// Cadence is STATE-based, not calendar-based: a period is due when the trade date's
// period key differs from the period of the last rebalance actually evaluated. On an
// uninterrupted calendar that is exactly "the first trading day of the period"; after a
// skipped day (stale data, an outage) it catches up on the next fresh day instead of
// silently losing the whole month.

import {isTradingDay} from "@/lib/prices/market-hours";
import type {Cadence} from "@/lib/strategies/types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];

export const periodKey = (date: string, cadence: Cadence): string => {
    switch (cadence) {
        case 'daily':
            return date;
        case 'monthly':
            return date.slice(0, 7);
        case 'quarterly': {
            const month = Number(date.slice(5, 7));
            return `${date.slice(0, 4)}-Q${Math.floor((month - 1) / 3) + 1}`;
        }
        case 'once':
            return 'once';
    }
};

export const isRebalanceDue = (cadence: Cadence, tradeDate: string, lastRebalanceDate: string | null): boolean =>
    lastRebalanceDate === null || periodKey(tradeDate, cadence) !== periodKey(lastRebalanceDate, cadence);

// Display only: is this trade date the first session of its period? (Compares with the
// previous completed bar, so it never depends on stored state.)
export const isFirstSessionOfPeriod = (cadence: Cadence, tradeDate: string, previousBarDate: string): boolean =>
    cadence !== 'daily' && cadence !== 'once' && periodKey(tradeDate, cadence) !== periodKey(previousBarDate, cadence);

const shiftMonths = (date: string, months: number): {year: number; month: number} => {
    const year = Number(date.slice(0, 4));
    const monthIndex = Number(date.slice(5, 7)) - 1 + months;
    return {year: year + Math.floor(monthIndex / 12), month: ((monthIndex % 12) + 12) % 12};
};

export const describeNextRebalance = (cadence: Cadence, lastRebalanceDate: string | null): string => {
    switch (cadence) {
        case 'daily':
            return 'every trading day';
        case 'once':
            return lastRebalanceDate === null ? 'on the first run' : 'never — it bought once';
        case 'monthly': {
            if (lastRebalanceDate === null) return 'on the first run';
            const next = shiftMonths(lastRebalanceDate, 1);
            return `first trading day of ${MONTH_NAMES[next.month]} ${next.year}`;
        }
        case 'quarterly': {
            if (lastRebalanceDate === null) return 'on the first run';
            const month = Number(lastRebalanceDate.slice(5, 7));
            const next = shiftMonths(lastRebalanceDate, 3 - ((month - 1) % 3));
            return `first trading day of ${MONTH_NAMES[next.month]} ${next.year}`;
        }
    }
};

const addCalendarDays = (date: string, days: number): string =>
    new Date(new Date(`${date}T00:00:00Z`).getTime() + days * MS_PER_DAY).toISOString().slice(0, 10);

// Live only (the NYSE table starts in 2025): the last session strictly before `date`.
export const previousTradingDay = (date: string): string => {
    let cursor = addCalendarDays(date, -1);
    // Bounded: the longest NYSE closure in the table is a few days.
    for (let i = 0; i < 14; i += 1) {
        if (isTradingDay(cursor)) return cursor;
        cursor = addCalendarDays(cursor, -1);
    }
    return cursor;
};
