// What the table's overlays offer, worked out from the view: the top bar's own-seat choices, the join
// card's state, the invite's deal button, the host drawer's people, controls and settings form, the
// bank's own-chips buttons and its "chips in, by time" list, and the drawers closing when a turn
// comes round. Pure and client-safe: components/poker-night/TableOverlays and the pieces it mounts
// draw what these return and send what the player picks through the table's routes, and the server
// checks every one of them again.

import {BANK_COPY, JOIN_COPY, OVERLAY_COPY, REFUSAL_COPY, TABLE_COPY} from '@/lib/learn/copy/poker-night';
import {buyOptions, type BankRow} from '@/lib/poker-night/bank';
import {parseChips} from '@/lib/poker-night/bet-sizing';
import {checkConfig, mergeConfig} from '@/lib/poker-night/config';
import {configIssueText, TIMER_PRESETS} from '@/lib/poker-night/lobby';
import type {GameConfig, LedgerKind, RebuyPolicy} from '@/lib/poker-night/types';
import type {JoinOutcome, JoinView, MeView, People, PlayerView, Presence, SeatView, TableView} from '@/lib/poker-night/view-types';

// How long "Press and hold to remove" must stay pressed.
export const HOLD_TO_CONFIRM_MS = 2000;

// ── the table at a glance ──

export const seatedCount = (table: Pick<TableView, 'seats'>): number => table.seats.filter((s) => s !== null).length;

export const openSeats = (table: Pick<TableView, 'seats'>): number[] => table.seats.flatMap((s, i) => (s === null ? [i] : []));

export const handLive = (table: Pick<TableView, 'hand'>): boolean => table.hand !== null && table.hand.phase !== 'complete';

// Dealt into the hand in play and still holding cards (not folded).
export const holdsCards = (table: Pick<TableView, 'hand' | 'seats'>, seat: number | null): boolean => {
    if (seat === null || !handLive(table)) return false;
    const s = table.seats[seat];
    return s !== null && s !== undefined && s.cards !== 'none';
};

// The chips a seat holds at the table, a live pot included (the bank's "stack").
export const seatChips = (seat: Pick<SeatView, 'chips' | 'inPot'> | null | undefined): number => (seat ? seat.chips + seat.inPot : 0);

// The turn number while it is the viewer's turn to act, else null. Each new one closes any drawer
// or dialog the viewer has open, so nothing modal stands over the action bar while the clock runs.
export const myTurnKey = (view: Pick<PlayerView, 'hand' | 'turn' | 'me'> | null): number | null => {
    if (!view || view.me.seat === null || !view.hand) return null;
    return view.hand.phase === 'betting' && view.hand.actor === view.me.seat ? view.turn : null;
};

// ── the viewer's own seat (the top bar's menu) ──

// Between hands the seat can sit out, come back after sitting out, or come back from away; during
// a hand only "sit out next hand" (the engine keeps that for the next deal).
export type SeatChoice = 'sit-out' | 'deal-me-in' | 'back';

export type OwnSeat = {
    seat: number | null;
    chips: number; // a live pot included
    stack: number; // behind
    dealtIn: boolean; // holds cards in the hand in play: leaving folds them at the next bet
    choice: SeatChoice | null;
    canLeave: boolean;
    canTakeSeat: boolean; // a watcher, with a seat open
};

export const ownSeat = (view: Pick<PlayerView, 'seats' | 'hand' | 'status' | 'me'>): OwnSeat => {
    const seat = view.me.seat;
    const s = seat === null ? null : view.seats[seat] ?? null;
    const closed = view.status === 'closed';
    if (!s) return {seat: null, chips: 0, stack: 0, dealtIn: false, choice: null, canLeave: false, canTakeSeat: !closed && openSeats(view).length > 0};
    const leaving = s.state === 'leaving';
    const choice: SeatChoice | null = closed || leaving ? null : s.state === 'away' ? 'back' : s.state === 'sitting-out' ? 'deal-me-in' : 'sit-out';
    return {seat, chips: seatChips(s), stack: s.chips, dealtIn: holdsCards(view, seat), choice, canLeave: !closed && !leaving, canTakeSeat: false};
};

// ── the join card ──

export type JoinCardState =
    | {kind: 'removed'}
    | {kind: 'locked'}
    | {kind: 'room-full'}
    | {kind: 'open'; canSit: boolean; canWatch: boolean; chips: {min: number; max: number} | null};

// What a visitor who has not joined can do: nothing once removed, at a locked table or in a room that
// keeps as many people as it can; else sit while a seat is open, watch while a place is, and choose
// their chips only when the table's minimum and cap differ.
export const joinCardState = (join: JoinView): JoinCardState => {
    if (join.banned) return {kind: 'removed'};
    if (join.locked) return {kind: 'locked'};
    if (join.roomFull) return {kind: 'room-full'};
    return {kind: 'open', canSit: join.seatsFree > 0, canWatch: !join.watchersFull, chips: chipsRange(join.buyIn.min, join.buyIn.max)};
};

// The chips field's range, or null when there is nothing to choose.
export const chipsRange = (min: number, max: number): {min: number; max: number} | null => (min < max ? {min, max} : null);

// A typed number of chips inside the range, else null ("2,000", "2k" and "2000" all read 2,000).
export const chipsInValue = (text: string, range: {min: number; max: number}): number | null => {
    const n = parseChips(text);
    return n !== null && n >= range.min && n <= range.max ? n : null;
};

// What the table says after a join: where the player sat and anything that changed on the way.
export const joinNotes = (
    outcome: JoinOutcome, renamed: string | null, view: Pick<PlayerView, 'seats' | 'hand' | 'me'>, asked: 'player' | 'watcher',
): string[] => {
    const notes: string[] = [];
    if (renamed !== null) notes.push(JOIN_COPY.renamed(renamed));
    if (outcome === 'moved') notes.push(JOIN_COPY.seatTaken);
    if (outcome === 'full') notes.push(JOIN_COPY.full);
    if (outcome === 'watching' && asked === 'watcher') notes.push(JOIN_COPY.watching);
    const seat = view.me.seat === null ? null : view.seats[view.me.seat] ?? null;
    if ((outcome === 'seated' || outcome === 'moved') && seat) {
        if (handLive(view)) notes.push(JOIN_COPY.seated);
        if (seat.owesPost) notes.push(JOIN_COPY.posting);
    }
    return notes;
};

// ── the invite ──

// "Deal the first hand": the host's, before the first deal; ready once two players sit.
export const inviteDeal = (table: Pick<TableView, 'status' | 'closing' | 'seats'>, me: Pick<MeView, 'isHost'> | null): {show: boolean; ready: boolean} =>
    ({show: !!me?.isHost && table.status === 'open' && !table.closing, ready: seatedCount(table) >= 2});

// ── the host drawer ──

export type TableControl = 'deal' | 'pause' | 'resume';

// The one button that moves the game: deal it, pause it, or resume it; none once the night is ending.
export const tableControl = (table: Pick<TableView, 'status' | 'closing'>): TableControl | null => {
    if (table.closing) return null;
    if (table.status === 'open') return 'deal';
    if (table.status === 'playing') return 'pause';
    if (table.status === 'paused') return 'resume';
    return null;
};

export type HostRow = {
    pid: string;
    name: string;
    avatar: string | null;
    seat: number | null;
    chips: number; // at the table, a live pot included; 0 for someone without a seat
    stack: number; // behind, out of any pot: what a removal or a leave cashes out for sure
    presence: Presence | null; // known for a seat only
    leftWith: number | null; // what someone without a seat left the table with, when they played
    host: boolean;
    me: boolean;
    dealtIn: boolean;
};

export type HostPeople = {players: HostRow[]; removed: {pid: string; name: string; avatar: string | null}[]};

type PeopleInput = Pick<TableView, 'seats' | 'hand' | 'hostPid' | 'ledger'> & {people: People; removed: readonly string[]};

// Everyone the host can act on: the seated players in seat order, then everyone else the room
// keeps by name; the removed in their own list, for "Let back in" — a removed player still seated
// until the hand ends among them, never twice.
export const hostPeople = (view: PeopleInput, me: string | null): HostPeople => {
    const removed = new Set(view.removed);
    const seatOf = new Map<string, number>();
    view.seats.forEach((s, i) => s && seatOf.set(s.pid, i));
    const ledger = new Map(view.ledger.map((row) => [row.pid, row]));
    const row = (pid: string): HostRow => {
        const seat = seatOf.get(pid) ?? null;
        const s = seat === null ? null : view.seats[seat];
        const left = ledger.get(pid);
        return {
            pid, name: view.people[pid]?.name ?? '', avatar: view.people[pid]?.avatar ?? null, seat,
            chips: seatChips(s), stack: s ? s.chips : 0, presence: s ? s.presence : null,
            leftWith: s || !left || left.cashedOut === 0 ? null : left.cashedOut,
            host: pid === view.hostPid, me: pid === me, dealtIn: holdsCards(view, seat),
        };
    };
    const seated = [...seatOf.entries()].filter(([pid]) => !removed.has(pid)).sort((a, b) => a[1] - b[1]).map(([pid]) => row(pid));
    const others = Object.keys(view.people)
        .filter((pid) => !seatOf.has(pid) && !removed.has(pid))
        .map(row)
        .sort((a, b) => Number(b.host) - Number(a.host) || a.name.localeCompare(b.name));
    return {
        players: [...seated, ...others],
        removed: view.removed.filter((pid) => view.people[pid] !== undefined)
            .map((pid) => ({pid, name: view.people[pid].name, avatar: view.people[pid].avatar})),
    };
};

// What a host row says under the name: the seat, or what someone without one is doing.
export const hostRowStatus = (row: HostRow): string => {
    if (row.seat === null) return row.leftWith !== null ? BANK_COPY.leftWith(row.leftWith) : OVERLAY_COPY.watching;
    const where = TABLE_COPY.seat(row.seat);
    return row.presence && row.presence !== 'here' ? `${where} · ${TABLE_COPY.presence[row.presence]}` : where;
};

// The settings form: the chip figures as typed, the rest as chosen.
export type GameForm = {
    smallBlind: string;
    bigBlind: string;
    ante: string;
    buyInMin: string;
    buyInMax: string;
    turnSeconds: number;
    rebuys: RebuyPolicy;
    maxRebuys: number | null;
};

export type GameField = keyof GameForm;
export const GAME_FIELDS: readonly GameField[] = ['smallBlind', 'bigBlind', 'ante', 'buyInMin', 'buyInMax', 'turnSeconds'];
export const REBUY_FIELDS: readonly GameField[] = ['rebuys', 'maxRebuys'];

const plain = (n: number): string => String(n);

export const gameFormOf = (c: GameConfig): GameForm => ({
    smallBlind: plain(c.smallBlind), bigBlind: plain(c.bigBlind), ante: plain(c.ante),
    buyInMin: plain(c.buyInMin), buyInMax: plain(c.buyInMax), turnSeconds: c.turnSeconds, rebuys: c.rebuys, maxRebuys: c.maxRebuys,
});

// The turn timer's choices: the presets, and the table's own figure when it is not one of them.
export const timerChoices = (current: number): number[] => [...new Set([...TIMER_PRESETS, current])].sort((a, b) => a - b);

// "Rebuys per player": no limit, a few counts, and the table's own figure.
const REBUY_LIMITS = [1, 2, 3, 5, 10, 20];
export const rebuyLimitChoices = (current: number | null): (number | null)[] =>
    [null, ...[...new Set([...REBUY_LIMITS, ...(current === null ? [] : [current])])].sort((a, b) => a - b)];

export type FormCheck = {ok: true; patch: Partial<GameConfig>} | {ok: false; message: string};

const chipField = (text: string, zeroOk: boolean): number | null => {
    const t = text.trim();
    if (zeroOk && (t === '' || t === '0')) return 0;
    return parseChips(t);
};

// The fields of a section, read and checked the way the engine will check them (config.checkConfig
// over the config with the change laid on it); the patch holds only what changed.
export const checkGameForm = (config: GameConfig, form: GameForm, fields: readonly GameField[]): FormCheck => {
    const values: Partial<GameConfig> = {};
    for (const field of fields) {
        switch (field) {
            case 'smallBlind': case 'bigBlind': case 'ante': case 'buyInMin': case 'buyInMax': {
                const n = chipField(form[field], field === 'ante');
                if (n === null) return {ok: false, message: REFUSAL_COPY['bad-amount']};
                values[field] = n;
                break;
            }
            case 'turnSeconds': values.turnSeconds = form.turnSeconds; break;
            case 'rebuys': values.rebuys = form.rebuys; break;
            case 'maxRebuys': values.maxRebuys = form.maxRebuys; break;
        }
    }
    const checked = checkConfig(mergeConfig(config, values));
    if (!checked.ok) return {ok: false, message: configIssueText(checked.issues)};
    const patch: Partial<GameConfig> = {};
    for (const key of Object.keys(values) as (keyof GameConfig)[]) {
        if (values[key] !== config[key]) (patch as Record<string, unknown>)[key] = values[key];
    }
    return {ok: true, patch};
};

// ── the bank ──

export type OwnChips = {
    seat: number;
    // The bank's one figure for a player's chips: behind plus a live pot (seatChips), as the table's
    // Stack column prints it; inPot says how much of it is in the pot. A top-up counts only behind.
    stack: number;
    behind: number;
    inPot: number;
    pendingBuy: number; // lands when the hand ends
    requested: number | null; // waiting for the host
    offer: {min: number; max: number; topUp: number; rebuy: boolean} | null;
    asksHost: boolean; // a buy here waits for the host's yes
    used: number; // rebuys so far
    maxRebuys: number | null;
};

// The viewer's own chips and what they may add, by the table's rules (bank.buyOptions, the client's
// copy of the server's own check); null without a seat.
export const ownChips = (view: Pick<PlayerView, 'seats' | 'ledger' | 'requests' | 'config' | 'me'>): OwnChips | null => {
    const seat = view.me.seat;
    const s = seat === null ? null : view.seats[seat] ?? null;
    if (seat === null || !s) return null;
    const used = view.ledger.find((row) => row.pid === view.me.pid)?.buys ?? 0;
    const requested = view.requests.find((r) => r.pid === view.me.pid)?.amount ?? null;
    return {
        seat, stack: seatChips(s), behind: s.chips, inPot: s.inPot, pendingBuy: s.pendingBuy, requested,
        offer: requested === null ? buyOptions(view.config, s, used) : null,
        asksHost: view.config.rebuys === 'approve' && !view.me.isHost,
        used, maxRebuys: view.config.maxRebuys,
    };
};

export type TimelineItem = {key: string; pid: string; name: string; at: number; kind: LedgerKind; amount: number};

// "Chips in, by time": every player's latest bank events, newest first.
export const bankTimeline = (rows: readonly Pick<BankRow, 'pid' | 'name' | 'events'>[], limit = 40): TimelineItem[] =>
    rows.flatMap((row) => row.events.map((e, i) => ({key: `${row.pid}:${i}:${e.at}`, pid: row.pid, name: row.name, at: e.at, kind: e.kind, amount: e.amount})))
        .sort((a, b) => b.at - a.at || a.key.localeCompare(b.key))
        .slice(0, limit);

// How a rebuy request the viewer was waiting on ended: their chips went up (approved), or it went
// away without them (declined).
export const requestEnded = (before: {bought: number}, after: {bought: number; pendingBuy: number}): 'approved' | 'declined' =>
    after.bought > before.bought || after.pendingBuy > 0 ? 'approved' : 'declined';

// ── the host's waiting requests (a dot on the menu icon) ──

export const waitingRequests = (table: Pick<TableView, 'requests'>, me: Pick<MeView, 'isHost'> | null): number =>
    me?.isHost ? table.requests.length : 0;
