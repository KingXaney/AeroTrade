// The end of the night (components/poker-night NightSummary): the table, how many hands and how
// long, the final counts — every player who sat, by net — and the night's awards
// (lib/poker-night/awards). Pure and client-safe: the /play page builds it on the server from a
// closed room's view (lib/poker-night/room.roomView), the room's own times, the ledger's counters
// and the throws the room counted, and the same function can read any view with people. What it
// returns names players by pid, name and look only: no counter, account or guest leaves the server.
//
// Once the table closes every player is cashed out, so a player "finished with" what they left
// with; on a table still open it counts the chips they have at the table too.

import {SUMMARY_COPY, TABLE_COPY} from '@/lib/learn/copy/poker-night';
import {nightAwards, type AwardId, type NightCounters, type ThrowCounts} from '@/lib/poker-night/awards';
import {bankView, type BankInput} from '@/lib/poker-night/bank';
import type {TableView} from '@/lib/poker-night/view-types';

export type Standing = {
    pid: string;
    name: string;
    avatar: string | null;
    place: number; // 1 for the highest net; ties share a place
    chipsIn: number;
    finished: number; // what they ended with: chips at the table plus everything they left with
    net: number;
    removed: boolean;
    me: boolean;
};

// One award as the summary shows it: who (every name on a tie, in the standings' order) and the
// figure it was won with.
export type AwardWinner = {pid: string; name: string; avatar: string | null; me: boolean};
export type AwardView = {id: AwardId; value: number; winners: AwardWinner[]};

export type NightSummaryView = {
    table: string; // the shown name: the host's, else "Table CODE"
    code: string;
    hands: number;
    startedAt: number; // ms
    endedAt: number; // ms
    minutes: number;
    standings: Standing[];
    broughtIn: number;
    balanced: boolean; // every chip accounted for
    me: string | null; // the viewer's pid, when they played or watched
    awards: AwardView[]; // only those whose data exists, in lib/poker-night/awards' order
};

export type SummaryInput = {
    view: BankInput & Pick<TableView, 'handNo' | 'settings'> & {code: string};
    startedAt: number;
    endedAt: number;
    me?: string | null;
    counters?: readonly NightCounters[]; // the ledger's rows (types.LedgerRow): read here, never returned
    throws?: ThrowCounts; // the room's stored throws (awards.throwCountsOf)
};

export const summarize = ({view, startedAt, endedAt, me = null, counters = [], throws = new Map()}: SummaryInput): NightSummaryView => {
    const bank = bankView(view, {me});
    // By net, then fewer chips in, then the order they first sat (the bank's own order is stable).
    const sorted = [...bank.rows].sort((a, b) => b.net - a.net || a.chipsIn - b.chipsIn);
    const standings = sorted.map((row): Standing => ({
        pid: row.pid, name: row.name, avatar: row.avatar,
        place: 1 + sorted.filter((other) => other.net > row.net).length,
        chipsIn: row.chipsIn, finished: row.stack + row.cashedOut, net: row.net, removed: row.removed, me: row.me,
    }));
    const byPid = new Map(standings.map((s) => [s.pid, s]));
    const awards = nightAwards(standings.map((s) => s.pid), counters, throws).map((award): AwardView => ({
        id: award.id,
        value: award.value,
        winners: award.pids.map((pid) => {
            const s = byPid.get(pid)!;
            return {pid, name: s.name, avatar: s.avatar, me: s.me};
        }),
    }));
    return {
        table: TABLE_COPY.name(view.settings.name, view.code), code: view.code, hands: view.handNo,
        startedAt, endedAt, minutes: Math.max(0, Math.round((endedAt - startedAt) / 60_000)),
        standings, broughtIn: bank.broughtIn, balanced: bank.balanced, me, awards,
    };
};

// The night's date as the summary prints it ("Oct 7, 2026"), in the reader's time zone unless one
// is named. Call it where the time zone is the reader's: in the browser, after mount.
export const nightDate = (ms: number, timeZone?: string): string =>
    new Intl.DateTimeFormat('en-US', {month: 'short', day: 'numeric', year: 'numeric', ...(timeZone ? {timeZone} : {})}).format(ms);

// What "Copy summary" puts on the clipboard.
export const summaryText = (summary: NightSummaryView, date: string): string => SUMMARY_COPY.text({
    table: summary.table, date, hands: summary.hands, minutes: summary.minutes,
    standings: summary.standings.map((s) => ({name: s.name, net: s.net, removed: s.removed})),
    awards: summary.awards.map((a) => ({id: a.id, names: a.winners.map((w) => w.name), value: a.value})),
});
