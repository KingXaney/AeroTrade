// Copy for "Time in the market" on the buy-and-hold page: three ways of owning SPY over one
// window, side by side. Every sentence describes what each way did over those days; none says
// which way to take, and no sentence ranks them (the test holds each to the 'copy' tier of
// lib/learn/banned.ts on a grid of inputs).
//
// The tiles print money from whole cents (lib/strategies/learn/time-in-market.ts summarizeWay), so the
// printed "worth at the end" minus the amount the window line states is the printed change, to
// the cent, and the printed percentage is that change over that amount. Every way takes in
// exactly that amount by its last day, so the amount is stated once, in the window line
// (invariant 8), and never under a way.

import {CASH_YIELD_SPREAD} from "@/lib/income/accrual";
import {MAX_LOOKBACK_DAYS, MIN_WINDOW_DAYS, type StartSource, type UnderwaterSpan, type WayKey, type WaySummary} from "@/lib/strategies/learn/time-in-market";
import {pctOneDecimal, shortDate} from "@/lib/learn/copy/portfolio";
import type {GlossaryKey} from "@/lib/learn/glossary";

// The terms "Why the start date matters" lists after its paragraphs, which say only what these
// do not: how the start date moves each way.
export const TIM_TERMS: readonly GlossaryKey[] = ['lump-sum', 'dollar-cost-averaging', 'cash-only', 'underwater', 't-bill-rate'];

const MONEY = new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2});
const WHOLE = new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0});
const COUNT = new Intl.NumberFormat('en-US');

// The window's amount: '$10,000', or to the cent when it has cents, so the tiles add up against it.
const amountText = (amount: number): string => (Number.isInteger(amount) ? WHOLE.format(amount) : MONEY.format(amount));

// '$12,345.67' from cents.
export const moneyFromCents = (cents: number): string => MONEY.format(cents / 100);

// '+$2,345.67', '−$120.00' (a true minus), '$0.00'.
export const signedCents = (cents: number): string => (cents === 0 ? '$0.00' : `${cents < 0 ? '−' : '+'}${MONEY.format(Math.abs(cents) / 100)}`);

// The change over what was put in, to two decimals, from the same cents the tiles print.
export const changePctText = (changeCents: number, contributedCents: number): string => {
    const pct = contributedCents > 0 ? Math.round(changeCents / contributedCents * 10_000) / 100 : 0;
    return pct === 0 ? '0.00%' : `${pct < 0 ? '−' : '+'}${Math.abs(pct).toFixed(2)}%`;
};

const day = (date: string) => shortDate(date, true);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

type TileText = {value: string; hint?: string};
type WayTiles = {end: TileText; change: TileText; underwater: TileText};

const UNPRICED: WayTiles = {end: {value: '—'}, change: {value: '—'}, underwater: {value: '—'}};

const underwaterHint = (longest: UnderwaterSpan | null): string => {
    if (longest === null) return 'not one trading day';
    const length = plural(longest.sessions, 'trading day', 'trading days');
    return longest.ongoing ? `since ${day(longest.from)}, ${length} so far` : `longest ${day(longest.from)} → ${day(longest.to)}, ${length}`;
};

// The three tiles of one way, exactly as printed. A way the rates could not price prints "—"
// in every tile; the panel states why once (TIM_COPY.rateGap).
export const wayTiles = (summary: WaySummary | null): WayTiles => {
    if (summary === null) return UNPRICED;
    return {
        end: {value: moneyFromCents(summary.endCents)},
        change: {value: signedCents(summary.changeCents), hint: `${changePctText(summary.changeCents, summary.contributedCents)} of the dollars put in`},
        underwater: {value: `${summary.underwaterSessions} of ${summary.sessions} days`, hint: underwaterHint(summary.longest)},
    };
};

export const TIM_COPY = {
    heading: 'Time in the market',
    startLabel: 'Start date',
    submit: 'Show',
    range: (floor: string, ceiling: string) => `Any date from ${day(floor)} to ${day(ceiling)}.`,
    window: (amount: number, start: string, end: string, sessions: number) =>
        `${amountText(amount)} each way · ${day(start)} → ${day(end)} · ${plural(sessions, 'trading day', 'trading days')}`,
    // `inception` is the account's inceptionAt, which a reset re-anchors: it dates the current
    // record, not the day the account opened. A default start that moved names the bound that
    // moved it — later than the inception, the lookback floor; earlier, the minimum window.
    source: (source: StartSource, from: string, inception: string | null): string | null => {
        if (source === 'fallback') return 'No paper account yet, so the window starts a year back.';
        if (source === 'requested' || inception === null) return null;
        if (inception === from) return "Starts the day your paper account's current record began.";
        const began = `Your paper account's current record began on ${day(inception)}`;
        return inception < from
            ? `${began}; a window here starts at most ${COUNT.format(MAX_LOOKBACK_DAYS)} days back, so it starts on ${day(from)}.`
            : `${began}; a window here spans at least ${MIN_WINDOW_DAYS} days, so it starts on ${day(from)}.`;
    },
    outOfRange: (requested: string, from: string) => `${requested} is outside the stored range; showing ${day(from)}.`,
    wayLabel: {lumpSum: 'All at once', dollarCostAverage: 'Monthly deposits', cashOnly: 'Cash only'} satisfies Record<WayKey, string>,
    // How each way takes in the window's amount; the amount itself is in the window line.
    wayDetail: (way: WayKey, start: string, deposits: number): string => {
        if (way === 'lumpSum') return `Into SPY on ${day(start)}`;
        if (way === 'dollarCostAverage') return `${plural(deposits, 'monthly deposit', 'monthly deposits')} into SPY`;
        return 'Kept as cash, earning interest';
    },
    endLabel: 'Worth at the end',
    changeLabel: 'Change',
    underwaterLabel: 'Below what was put in',
    rateGap: (date: string) => `No usable T-bill rate is stored for ${day(date)}, so a way holding cash that day cannot be priced and shows —.`,
    chartCaption: 'Growth of each dollar contributed',
    chartAria: (start: string, end: string) => `Three ways of owning SPY, ${day(start)} to ${day(end)}, as the value of each dollar put in`,
    noHistory: 'No stored SPY closes cover this window yet.',
    whyLabel: 'Why the start date matters',
    // How the start date moves each way; what each way is, is its glossary entry's to state.
    why: [
        'Started just before a fall, all at once spends the fall below the dollars put in; started at a low, it sits above them within weeks.',
        'Moving the start moves every monthly deposit with it, so which part of a fall each deposit meets changes, and so does how long the last ones stay in SPY.',
        'For cash only, the start sets just how many days earn interest, and at which T-bill rates.',
    ],
    // `rows` is the table as built: a start with no stored close drops its row.
    tableCaption: (end: string, rows: number) =>
        `The same amount and the same end date, ${day(end)}, from ${rows === 1 ? '1 earlier start' : `${rows} earlier starts a quarter apart`}:`,
    tableStart: 'Start',
    tableDate: (date: string) => day(date),
    tablePct: (pct: number | null) => (pct === null ? '—' : pctOneDecimal(pct)),
    caveat: `In hindsight, on stored daily closes: SPY held as shares, each dividend paid as cash on its pay date to the shares held the evening before its ex-date, each deposit invested at the close of the first trading day on or after it arrives, idle cash at the T-bill rate less ${(CASH_YIELD_SPREAD * 100).toFixed(2)}%, and no fees, taxes or spreads.`,
};
