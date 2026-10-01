// Copy for "Trading habits" on /portfolio: plain-word tiles over the learner's own lots. Every
// line is a measurement — how long, how many, how often, what it would be worth — set beside
// the catalog's own cadences and nothing else; none says what to do about it. The test holds
// each sentence to the 'copy' tier of lib/learn/banned.ts on a grid of inputs, and parses the
// printed figures back to check that they agree with each other.

import {PACE_WINDOW_DAYS, type CadenceControl, type Habits, type LotCount} from "@/lib/trading/learn/habits";
import type {GlossaryKey} from "@/lib/learn/glossary";
import {shortDate, signedMoney} from "@/lib/learn/copy/portfolio";

// The terms the panel's one "What these mean" lists, in order; 'had-you-held' only while that
// tile shows. The method paragraph leading it says only what these do not.
export const HABITS_TERMS: readonly GlossaryKey[] = ['hold-time', 'disposition-effect', 'trades', 'turnover', 'had-you-held'];

const MONEY = new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2});
const money = (cents: number): string => MONEY.format(cents / 100);
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

// '3 days', '1 day', 'under a day', '—' for none.
export const daysHeld = (days: number | null): string => {
    if (days === null) return '—';
    if (days < 1) return 'under a day';
    return plural(Math.round(days), 'day', 'days');
};

// A share of lots as a whole percentage, '—' when there are none to share.
export const lotShare = ({sold, total}: LotCount): string => (total > 0 ? `${Math.round((sold / total) * 100)}%` : '—');

// Dollars sold against the starting balance: '6%', 'under 1%' for a sliver, '0%' for nothing.
export const turnoverShare = ({soldCents, startingCents}: Habits['turnover']): string => {
    if (!(startingCents > 0)) return '—';
    const pct = Math.round((soldCents / startingCents) * 100);
    return pct === 0 && soldCents > 0 ? 'under 1%' : `${pct}%`;
};

const CADENCE_PHRASE: Record<CadenceControl['cadence'], (sessions: number, count: number) => string> = {
    daily: (sessions) => `on any of these ${plural(sessions, 'session', 'sessions')}`,
    monthly: () => 'on 1 day a month',
    quarterly: () => 'on 1 day a quarter',
    once: (_sessions, count) => `on ${count === 1 ? 'its' : 'their'} first day only`,
};

const cadenceName = (cadence: CadenceControl['cadence'], count: number): string =>
    `${count} ${cadence === 'once' ? 'buy-once' : cadence} ${count === 1 ? 'rule' : 'rules'}`;

export const HABITS_COPY = {
    heading: 'Trading habits',
    // Called with HABITS_MIN_CLOSED_LOTS, the threshold the read holds the panel to.
    emptyTitle: (lots: number): string => `Habits show after ${plural(lots, 'closed lot', 'closed lots')}`,
    emptyDescription: (closed: number): string =>
        `A lot is the shares one buy added, and a sell closes the oldest ones first. This account has closed ${plural(closed, 'lot', 'lots')} of your own orders so far.`,

    holdLabel: 'How long you held',
    holdValue: ({winnerDays, loserDays}: Habits['hold']): string => `winners ${daysHeld(winnerDays)} · losers ${daysHeld(loserDays)}`,
    holdHint: ({winners, losers}: Habits['hold']): string =>
        `median of ${plural(winners, 'winning lot', 'winning lots')} and ${plural(losers, 'losing lot', 'losing lots')} sold`,

    soldLabel: 'What you sold',
    soldValue: ({winners, losers}: Habits['sold']): string => `sold ${lotShare(winners)} of winners · ${lotShare(losers)} of losers`,
    soldHint: ({winners, losers}: Habits['sold']): string =>
        `${winners.sold} of ${plural(winners.total, 'lot', 'lots')} up · ${losers.sold} of ${plural(losers.total, 'lot', 'lots')} down`,
    // Once per panel, under the tiles: open lots with no live quote are in neither group.
    unpricedOpen: (count: number): string | null =>
        (count > 0 ? `${plural(count, 'open lot', 'open lots')} without a live quote left out of winners and losers` : null),

    paceLabel: 'How often you traded',
    paceValue: ({fills, days}: Habits['pace']): string => `${plural(fills, 'fill', 'fills')} on ${plural(days, 'day', 'days')}`,
    paceHint: ({full, since}: Habits['pace']): string => (full ? `in the last ${PACE_WINDOW_DAYS} days` : `since ${shortDate(since)}`),

    turnoverLabel: 'Shares sold',
    turnoverValue: ({soldCents}: Habits['turnover']): string => money(soldCents),
    turnoverHint: (turnover: Habits['turnover']): string =>
        `${turnoverShare(turnover)} of the ${money(turnover.startingCents)} starting balance, same days`,

    heldLabel: 'Had you held',
    heldValue: ({worthNowCents}: NonNullable<Habits['hadYouHeld']>): string => `${money(worthNowCents)} now`,
    heldHint: ({soldForCents, worthNowCents}: NonNullable<Habits['hadYouHeld']>): string =>
        `sold for ${money(soldForCents)} · ${signedMoney((worthNowCents - soldForCents) / 100)} at the last quote`,
    heldScope: ({symbols, capped}: NonNullable<Habits['hadYouHeld']>): string =>
        `${capped ? 'the most recent names sold' : 'the names sold'}: ${symbols.join(', ')}`,

    // The catalog's clocks, the only yardstick beside the learner's pace.
    cadenceLine: (controls: readonly CadenceControl[], sessions: number): string =>
        `Beside the strategies' clocks: ${controls.map((c) => `${cadenceName(c.cadence, c.names.length)} ${CADENCE_PHRASE[c.cadence](sessions, c.names.length)}`).join(' · ')}`,

    // Leads the panel's one "What these mean" with what the definitions beneath it do not say:
    // whose fills count, and that the pairing still runs over all of them (lib/trading/learn/habits.ts).
    // How a sell is paired, and what a winner is, are the hold-time and disposition-effect
    // entries' to state.
    method: "Only orders you placed count; a strategy's, a suggestion's or the Navigator's fill is left out. Lots are still paired across every fill in this account, so a lot counts here when you placed the sell that closed it or, while it is open, the buy that opened it.",
};
