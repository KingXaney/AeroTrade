// Dividend coverage bookkeeping — pure, so the "never claim a gap" rule is tested without a
// database. A range is the dates a symbol's stored dividends can be trusted for.

export type CoverageRange = {from: string; through: string};

// A new payload joins the stored range only when the two overlap. Top-ups fetch a month, so
// daily runs always overlap; a gap means fetches stopped for weeks, and the dates in between
// were never parsed — so the older range is dropped rather than bridged across the hole. The
// income job then sees coverage that no longer reaches back and asks for a five-year refetch.
export const mergeCoverage = (stored: CoverageRange | null, payload: CoverageRange | null): CoverageRange | null => {
    if (payload === null) return stored;
    if (stored === null || payload.from > stored.through) return payload;
    return {
        from: payload.from < stored.from ? payload.from : stored.from,
        through: payload.through > stored.through ? payload.through : stored.through,
    };
};

// A payload from a company's first session vouches for its dividends from the second (the first
// bar of any payload has no step to infer one from); a week covers a session the provider
// skipped early on. No dividend is paid on a share in its first week of trading.
export const LISTING_COVERAGE_SLACK_DAYS = 7;

const plusDays = (date: string, days: number): string => {
    const at = new Date(`${date}T00:00:00Z`);
    at.setUTCDate(at.getUTCDate() + days);
    return at.toISOString().slice(0, 10);
};

// Are a symbol's dividends vouched for over [from, through]? From `from`, or for a company
// listed inside the window (listedOn, from the provider) from its listing — before it, there
// was no share to pay on, and a requirement no payload can meet would hold a backtest back
// for ever (the culture backtest waited on DoorDash, Airbnb and two dozen more from launch).
export const coversWindow = (range: CoverageRange | null, listedOn: string | null, from: string, through: string): boolean => {
    if (range === null || range.through < through) return false;
    const needFrom = listedOn !== null && listedOn > from ? plusDays(listedOn, LISTING_COVERAGE_SLACK_DAYS) : from;
    return range.from <= needFrom;
};
