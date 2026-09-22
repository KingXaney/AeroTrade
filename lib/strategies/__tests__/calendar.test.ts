import {describe, expect, it} from "vitest";
import {
    describeNextRebalance,
    isFirstSessionOfPeriod,
    isRebalanceDue,
    periodKey,
    previousTradingDay,
} from "@/lib/strategies/calendar";

describe("periodKey", () => {
    it("keys each cadence at its own granularity", () => {
        expect(periodKey('2026-09-21', 'daily')).toBe('2026-09-21');
        expect(periodKey('2026-09-21', 'monthly')).toBe('2026-09');
        expect(periodKey('2026-09-21', 'quarterly')).toBe('2026-Q3');
        expect(periodKey('2026-12-31', 'quarterly')).toBe('2026-Q4');
        expect(periodKey('2026-01-02', 'quarterly')).toBe('2026-Q1');
        expect(periodKey('2026-09-21', 'once')).toBe('once');
    });
});

describe("isRebalanceDue", () => {
    it("is always due before the first rebalance", () => {
        expect(isRebalanceDue('once', '2026-09-21', null)).toBe(true);
        expect(isRebalanceDue('monthly', '2026-09-21', null)).toBe(true);
    });

    it("a once strategy is never due again", () => {
        expect(isRebalanceDue('once', '2027-01-04', '2026-09-21')).toBe(false);
    });

    it("monthly is due on the first session of a new month and not later in it", () => {
        expect(isRebalanceDue('monthly', '2026-10-01', '2026-09-01')).toBe(true);
        expect(isRebalanceDue('monthly', '2026-09-22', '2026-09-01')).toBe(false);
    });

    it("catches up when the first session of the month was skipped", () => {
        // Oct 1 was skipped (stale data); the next fresh day is still due.
        expect(isRebalanceDue('monthly', '2026-10-05', '2026-09-01')).toBe(true);
        // …and once evaluated on Oct 5, Oct 6 is not.
        expect(isRebalanceDue('monthly', '2026-10-06', '2026-10-05')).toBe(false);
    });

    it("quarterly spans three months", () => {
        expect(isRebalanceDue('quarterly', '2026-09-30', '2026-07-01')).toBe(false);
        expect(isRebalanceDue('quarterly', '2026-10-01', '2026-07-01')).toBe(true);
    });

    it("daily is due every day", () => {
        expect(isRebalanceDue('daily', '2026-09-22', '2026-09-21')).toBe(true);
        expect(isRebalanceDue('daily', '2026-09-21', '2026-09-21')).toBe(false);
    });
});

describe("isFirstSessionOfPeriod", () => {
    it("compares the trade date with the previous bar", () => {
        expect(isFirstSessionOfPeriod('monthly', '2026-10-01', '2026-09-30')).toBe(true);
        expect(isFirstSessionOfPeriod('monthly', '2026-10-02', '2026-10-01')).toBe(false);
        expect(isFirstSessionOfPeriod('quarterly', '2026-10-01', '2026-09-30')).toBe(true);
        expect(isFirstSessionOfPeriod('quarterly', '2026-11-02', '2026-10-30')).toBe(false);
        expect(isFirstSessionOfPeriod('daily', '2026-10-01', '2026-09-30')).toBe(false);
    });
});

describe("describeNextRebalance", () => {
    it("names the next period", () => {
        expect(describeNextRebalance('daily', null)).toBe('every trading day');
        expect(describeNextRebalance('once', null)).toBe('on the first run');
        expect(describeNextRebalance('once', '2026-09-21')).toBe('never — it bought once');
        expect(describeNextRebalance('monthly', null)).toBe('on the first run');
        expect(describeNextRebalance('monthly', '2026-09-01')).toBe('first trading day of October 2026');
        expect(describeNextRebalance('monthly', '2026-12-01')).toBe('first trading day of January 2027');
        expect(describeNextRebalance('quarterly', '2026-07-01')).toBe('first trading day of October 2026');
        expect(describeNextRebalance('quarterly', '2026-08-15')).toBe('first trading day of October 2026');
        expect(describeNextRebalance('quarterly', '2026-10-01')).toBe('first trading day of January 2027');
    });
});

describe("previousTradingDay", () => {
    it("steps back over weekends and holidays", () => {
        expect(previousTradingDay('2026-09-22')).toBe('2026-09-21');
        // Monday → the Friday before.
        expect(previousTradingDay('2026-09-21')).toBe('2026-09-18');
        // The day after Independence Day (observed Friday 2026-07-03) → Thursday.
        expect(previousTradingDay('2026-07-06')).toBe('2026-07-02');
    });
});
