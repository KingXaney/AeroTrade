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

export const coversRange = (coverage: CoverageRange | null, from: string, through: string): boolean =>
    coverage !== null && coverage.from <= from && coverage.through >= through;
