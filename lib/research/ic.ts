// Information coefficients — how well a signal's ranking of names on one day lined up with the
// returns those names went on to earn — and how to tell a real one from noise. Pure and
// import-free. Research log R1 (docs/research/log.md): measure a brain's signals against what
// followed before changing them.
//
// A week's IC is Spearman's rank correlation between the signal and the forward return across
// the names that have both (Grinold & Kahn, Active Portfolio Management). Its mean over the weeks
// is the signal's skill; its t-statistic uses Newey–West standard errors, since consecutive
// weeks' h-week returns overlap by h − 1 weeks (Newey & West 1987).

// Fewer names than this in a week's cross-section and its IC is not computed.
export const MIN_CROSS_SECTION = 10;
// Fewer weeks than this and no summary is given.
export const MIN_IC_WEEKS = 8;

// Average ranks, 1-based: tied values share the mean of the ranks they span.
export const averageRanks = (values: readonly number[]): number[] => {
    const order = values.map((value, index) => ({value, index})).sort((a, b) => a.value - b.value);
    const ranks = new Array<number>(values.length);
    let start = 0;
    while (start < order.length) {
        let end = start;
        while (end + 1 < order.length && order[end + 1].value === order[start].value) end += 1;
        const rank = (start + end) / 2 + 1;
        for (let k = start; k <= end; k += 1) ranks[order[k].index] = rank;
        start = end + 1;
    }
    return ranks;
};

const pearson = (xs: readonly number[], ys: readonly number[]): number | null => {
    const n = xs.length;
    const mx = xs.reduce((sum, x) => sum + x, 0) / n;
    const my = ys.reduce((sum, y) => sum + y, 0) / n;
    let sxy = 0;
    let sxx = 0;
    let syy = 0;
    for (let i = 0; i < n; i += 1) {
        sxy += (xs[i] - mx) * (ys[i] - my);
        sxx += (xs[i] - mx) ** 2;
        syy += (ys[i] - my) ** 2;
    }
    return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
};

// Spearman's rank correlation over the pairs where both sides are finite numbers; null with
// fewer than `min` pairs, or when either side does not vary.
export const spearman = (xs: readonly (number | null)[], ys: readonly (number | null)[], min = MIN_CROSS_SECTION): number | null => {
    const pairs: [number, number][] = [];
    for (let i = 0; i < Math.min(xs.length, ys.length); i += 1) {
        const x = xs[i];
        const y = ys[i];
        if (x !== null && y !== null && Number.isFinite(x) && Number.isFinite(y)) pairs.push([x, y]);
    }
    if (pairs.length < min) return null;
    return pearson(averageRanks(pairs.map(([x]) => x)), averageRanks(pairs.map(([, y]) => y)));
};

// The t-statistic of a series' mean with a Newey–West (Bartlett-weighted) standard error over
// `lags` lags; null when the series is too short or does not vary.
export const neweyWestT = (series: readonly number[], lags: number): number | null => {
    const n = series.length;
    if (n < 2) return null;
    const mean = series.reduce((sum, x) => sum + x, 0) / n;
    const d = series.map((x) => x - mean);
    const gamma = (lag: number): number => {
        let sum = 0;
        for (let t = lag; t < n; t += 1) sum += d[t] * d[t - lag];
        return sum / n;
    };
    const maxLag = Math.max(0, Math.min(lags, n - 1));
    let longRun = gamma(0);
    for (let lag = 1; lag <= maxLag; lag += 1) longRun += 2 * (1 - lag / (maxLag + 1)) * gamma(lag);
    if (!(longRun > 0)) return null;
    return mean / Math.sqrt(longRun / n);
};

export type IcSummary = {
    weeks: number;
    meanIc: number;
    // Newey–West, lags = horizon − 1; null when the weekly ICs do not vary.
    tStat: number | null;
    // The share of weeks whose IC was above zero.
    positiveShare: number;
};

// The summary of one signal at one horizon: its weekly ICs, in week order, h weeks ahead each.
export const summarizeIc = (ics: readonly number[], horizonWeeks: number): IcSummary | null => {
    if (ics.length < MIN_IC_WEEKS) return null;
    return {
        weeks: ics.length,
        meanIc: ics.reduce((sum, ic) => sum + ic, 0) / ics.length,
        tStat: neweyWestT(ics, Math.max(0, horizonWeeks - 1)),
        positiveShare: ics.filter((ic) => ic > 0).length / ics.length,
    };
};

// One cell of a signal table: a signal at a horizon, over the weeks it could be measured.
export type SignalCell = {meanIc: number; tStat: number | null; weeks: number; positiveShare: number};
export type IcRow = {signal: string; horizonWeeks: number} & IcSummary;

// The table a brain prints: its rows in the order it hands them (a registry's, never by figure),
// only the horizons and the rows that have a figure (invariant 8), a gap where a cell has none.
export type IcTable = {
    horizons: number[];
    rows: {id: string; label: string; strong: boolean; cells: (SignalCell | null)[]}[];
};

export const icTable = (
    rows: readonly IcRow[],
    order: readonly {id: string; label: string; strong?: boolean}[],
    horizons: readonly number[],
): IcTable | null => {
    const at = new Map(rows.map((row) => [`${row.signal}|${row.horizonWeeks}`, row]));
    const shown = horizons.filter((h) => rows.some((row) => row.horizonWeeks === h));
    if (shown.length === 0) return null;
    const table = order
        .map(({id, label, strong = false}) => ({
            id,
            label,
            strong,
            cells: shown.map((h) => {
                const row = at.get(`${id}|${h}`);
                return row ? {meanIc: row.meanIc, tStat: row.tStat, weeks: row.weeks, positiveShare: row.positiveShare} : null;
            }),
        }))
        .filter((row) => row.cells.some((cell) => cell !== null));
    return table.length > 0 ? {horizons: [...shown], rows: table} : null;
};
