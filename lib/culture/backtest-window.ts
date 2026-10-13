// The culture backtest's windows, pure. The simulation pays income over calendar days — the
// backfill's depth before launch, through the day before — but dividends are vouched for by
// session: a Yahoo payload's coverage ends on its last bar, so a window that ends on a Sunday
// (a Monday launch) can never be covered, and the guard would refetch every simulated symbol
// whole each week until a bar happened to fall on the calendar day. The coverage window
// therefore ends on the last session before launch.

import {CULTURE_BACKFILL_CALENDAR_DAYS} from "@/lib/culture/config";
import {addCalendarDays} from "@/lib/dates";
import {previousTradingDay} from "@/lib/prices/market-hours";

export type DateWindow = {from: string; through: string};

// The window a build pays income over: the backfill's depth before launch, through the day before.
export const backtestWindow = (launchDate: string): DateWindow => ({
    from: addCalendarDays(launchDate, -CULTURE_BACKFILL_CALENDAR_DAYS),
    through: addCalendarDays(launchDate, -1),
});

// The window a symbol's dividends must be vouched for: the same depth, through the last
// session before launch — the latest date any bar can carry.
export const coverageWindow = (launchDate: string): DateWindow => ({
    from: backtestWindow(launchDate).from,
    through: previousTradingDay(launchDate),
});
