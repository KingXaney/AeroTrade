// Copy for the learning surfaces on /portfolio: "Where the return came from" (the return
// bridge and its guess), the risk lens, the dated drawdown the Max Drawdown tile and the
// chart band carry, and the empty Holdings table. Every sentence is a measurement — what moved the account, how much it
// swings, where its value sits — and none says what to do about it; the test holds each one
// to the 'copy' tier of lib/learn/banned.ts on a grid of inputs.
//
// Import-free of server code on purpose: AnalyticsStats renders drawdownLine and is bundled
// into a client file (StrategyPerformance). The Navigator's rails are read from its config
// so the comparison cannot drift from what the allocator does.

import {MAX_POSITION_WEIGHT, MIN_CASH_WEIGHT} from "@/lib/navigator/config";
import type {BridgeLineKey} from "@/lib/trading/learn/bridge";
import {unpricedText} from "@/lib/learn/copy/unpriced";
import type {DrawdownWindow} from '@/lib/trading/types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// 'YYYY-MM-DD' (an ET date) → 'Aug 3', or 'Aug 3, 2026' with the year. Read from the string,
// not through Date, so no timezone can move it a day.
export const shortDate = (date: string, withYear = false): string => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
    if (!match || !month) return date;
    return `${month} ${Number(match[3])}${withYear ? `, ${match[1]}` : ''}`;
};

const MONEY = new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2});
const WHOLE_DOLLARS = new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0});

// '+$1,234.50', '−$69.14' (a true minus, as the drawdown figures use), '$0.00' for anything
// that rounds to nothing.
export const signedMoney = (amount: number): string => {
    const text = MONEY.format(Math.abs(amount));
    if (text === '$0.00') return text;
    return `${amount < 0 ? '−' : '+'}${text}`;
};

// '−3.1%', '+8.8%', '0.0%'.
export const pctOneDecimal = (pct: number): string => {
    const rounded = Math.round(pct * 10) / 10;
    if (rounded === 0) return '0.0%';
    return `${rounded < 0 ? '−' : '+'}${Math.abs(rounded).toFixed(1)}%`;
};

const wholePct = (fraction: number): string => `${Math.round(fraction * 100)}%`;

// ---- the dated drawdown ----------------------------------------------------------------

export const DRAWDOWN_COPY = {
    needsHistory: 'Needs 2+ days of history',
    undated: 'Largest peak-to-trough dip',
};

// A fall that shows as at least 0.01% on the tile; anything smaller reads as "no drop".
const isVisibleDrawdown = (window: DrawdownWindow): boolean => Math.round(window.pct * 100) > 0;

const windowDates = (window: DrawdownWindow): string => {
    const crossesYear = window.peakDate.slice(0, 4) !== window.troughDate.slice(0, 4);
    return `${shortDate(window.peakDate, crossesYear)} → ${shortDate(window.troughDate, crossesYear)}`;
};

// The Max Drawdown tile's hint: "Aug 3 → Aug 21 · SPY −3.1% same days · +8.8% to recover".
// The tile's value already states the fall, so the hint dates it, sets SPY over the same
// days beside it, and says what the climb back from the low takes (or that it happened).
// Without a window — a simulated record, data from before windows existed — or with no fall
// at all, it keeps the undated hint.
export const drawdownLine = ({maxDrawdownPct, drawdown, benchmarkOverDrawdownPct}: {
    maxDrawdownPct: number | null;
    drawdown?: DrawdownWindow | null;
    benchmarkOverDrawdownPct?: number | null;
}): string => {
    if (maxDrawdownPct === null) return DRAWDOWN_COPY.needsHistory;
    if (!drawdown || !isVisibleDrawdown(drawdown)) return DRAWDOWN_COPY.undated;
    const parts = [windowDates(drawdown)];
    if (typeof benchmarkOverDrawdownPct === 'number') parts.push(`SPY ${pctOneDecimal(benchmarkOverDrawdownPct)} same days`);
    if (drawdown.recovered) parts.push('since recovered');
    else if (drawdown.recoveryPctNeeded !== null) parts.push(`${pctOneDecimal(drawdown.recoveryPctNeeded)} to recover`);
    return parts.join(' · ');
};

// The chart's legend entry for the shaded band.
export const drawdownBandLabel = (window: DrawdownWindow): string => `Shaded: the largest drop, ${windowDates(window)}`;

// The band PerformanceChart shades, peak date to trough date — null when there is no drop to
// shade, the same test the tile's hint applies.
export const drawdownBand = (window: DrawdownWindow | null | undefined): {from: string; to: string; label: string} | null =>
    window && isVisibleDrawdown(window) ? {from: window.peakDate, to: window.troughDate, label: drawdownBandLabel(window)} : null;

// ---- the performance chart ----------------------------------------------------------------

// The chart's caption on /portfolio, and what stands in for a curve before there are two
// daily snapshots to draw (the chart itself, and the dashboard's chart and analytics widgets).
export const PERFORMANCE_COPY = {
    caption: 'Returns include interest on cash and dividends · benchmark is SPY\'s total return, dividends reinvested',
    collecting: 'Collecting daily performance data — check back tomorrow.',
    snapshotNote: 'A value snapshot is recorded every market day at close.',
    widgetNoHistory: 'No performance history yet — snapshots start tomorrow.',
    widgetNoAnalytics: 'No analytics yet — they appear once a daily snapshot exists.',
} as const;

// ---- the holdings table ------------------------------------------------------------------

// PositionsTable with nothing held. /portfolio has no order panel, so the second sentence is
// the link to /trade, the page that has one.
export const HOLDINGS_COPY = {
    empty: 'No open positions.',
    toTradeDesk: 'Orders are placed on the Trade Desk.',
    // The /portfolio header's line under the account name: how many holdings, and on what basis
    // they are valued — live, at the last close, or (some or all) at cost.
    summary: (holdings: number, unpriced: number, marketOpen: boolean): string => {
        if (holdings === 0) return 'No open positions yet';
        const basis = unpricedText(unpriced, holdings) ?? (marketOpen ? 'live valuation' : 'valued at last close');
        return `${holdings} ${holdings === 1 ? 'holding' : 'holdings'} · ${basis}`;
    },
};

// ---- where the return came from ------------------------------------------------------------

export const BRIDGE_COPY = {
    heading: 'Where the return came from',
    emptyTitle: 'Nothing to split yet',
    emptyDescription: 'After the first trade or the first night of interest, the return splits here into price moves, sells, interest and dividends, adding up to the Total Return figure to the cent.',
    line: {
        price: 'Price moves on shares still held',
        realized: 'Locked in by sells',
        interest: 'Interest on cash',
        dividends: 'Dividends',
        residual: 'Not attributed to a line above',
    } satisfies Record<BridgeLineKey, string>,
    total: 'Total return',
    guessPrompt: (total: string): string => `Guess first: what share of this ${total} return came from interest and dividends?`,
    sliderLabel: 'Your guess, as a share of the total return',
    reveal: 'Reveal the split',
    guessAgain: 'guess again',
    guessed: ({guess, date, share, other}: {guess: number; date: string; share: number; other: number}): string => {
        const told = `You guessed ${Math.round(guess)}% on ${shortDate(date)} · interest and dividends were ${Math.round(share)}% of it`;
        return share > 100 ? `${told}; everything else came to ${signedMoney(other)}` : told;
    },
    // Once per panel, beside the price line: a holding with no live quote is valued at cost,
    // so its price move counts as zero here.
    unpriced: (unpriced: number, holdings: number): string | null => unpricedText(unpriced, holdings),
};

// ---- the risk lens ------------------------------------------------------------------------

export const RISK_COPY = {
    heading: 'Risk lens',
    swingLabel: 'Typical daily swing',
    swingValue: (dollars: number): string => `±${WHOLE_DOLLARS.format(Math.abs(dollars))}`,
    swingHint: (pct: number): string => `${pct.toFixed(2)}% of today's value`,
    swingNeedsHistory: 'Needs 3+ days of history',
    largestLabel: 'Largest position',
    largestValue: (weight: number): string => wholePct(weight),
    largestHint: (symbol: string, marketValue: number, atCost: boolean): string =>
        `${symbol} · ${WHOLE_DOLLARS.format(marketValue)}${atCost ? ' · valued at cost' : ''}`,
    allCash: 'cash 100% · no holdings yet',
    // Described by mechanism: what the Navigator's allocator does, beside the measured share.
    caption: (symbol: string, weight: number): string =>
        `${wholePct(weight)} of this account moves with one holding, ${symbol} · the AI Navigator caps itself at ${wholePct(MAX_POSITION_WEIGHT)} per name and keeps at least ${wholePct(MIN_CASH_WEIGHT)} in cash`,
};
