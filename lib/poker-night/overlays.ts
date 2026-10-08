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
import type {JoinOutcome, JoinView, MeView, OwnNext, People, PlayerView, Presence, SeatView, TableView} from '@/lib/poker-night/view-types';

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

// Whether a new name and look from the viewer must wait for the hand in play to end: they sit in a
// seat and a hand is being played (the room refuses it then, not_now). My look keeps the draft and,
// once saved, sends it by itself when this turns false (components/poker-night/PokerNightRoom).
export const profileWaits = (view: Pick<PlayerView, 'hand' | 'me'> | null): boolean =>
    view !== null && view.me.seat !== null && handLive(view);

// The turn number while it is the viewer's turn to act, else null. Each new one closes any drawer
// or dialog the viewer has open, so nothing modal stands over the action bar while the clock runs.
export const myTurnKey = (view: Pick<PlayerView, 'hand' | 'turn' | 'me'> | null): number | null => {
    if (!view || view.me.seat === null || !view.hand) return null;
    return view.hand.phase === 'betting' && view.hand.actor === view.me.seat ? view.turn : null;
};

// ── the viewer's own seat (the top bar's menu) ──

// Between hands the seat can sit out, come back after sitting out, or come back from away; during
// a hand "sit out next hand" (the engine keeps that for the next deal), and once that waits, "deal me
// in", which takes it back. Nothing once the viewer has left the hand in play (MeView.next 'leave'):
// the seat is cashed out when it ends.
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
    const leaving = s.state === 'leaving' || view.me.next === 'leave';
    const waits = view.me.next === 'sit-out' && handLive(view);
    const choice: SeatChoice | null = closed || leaving ? null
        : s.state === 'away' ? 'back'
            : s.state === 'sitting-out' || waits ? 'deal-me-in'
                : 'sit-out';
    return {seat, chips: seatChips(s), stack: s.chips, dealtIn: holdsCards(view, seat), choice, canLeave: !closed && !leaving, canTakeSeat: false};
};

// ── leaving, and the way home ──

// What sitting down again would take, said before a player leaves: rebuys are off, they need the
// host's yes, or this player has had every rebuy the table allows (sitting again is a rebuy:
// engine.sit). Null when sitting down again simply works.
export type LeaveAsk = 'rebuys-off' | 'rebuys-ask' | 'rebuy-cap';

export const leaveAsks = (config: Pick<GameConfig, 'rebuys' | 'maxRebuys'>, buys: number, isHost: boolean): LeaveAsk | null => {
    if (config.rebuys === 'off') return 'rebuys-off';
    if (config.maxRebuys !== null && buys >= config.maxRebuys) return 'rebuy-cap';
    if (config.rebuys === 'approve' && !isHost) return 'rebuys-ask';
    return null;
};

const LEAVE_NOTES: Record<LeaveAsk, string> = {
    'rebuys-off': TABLE_COPY.rebuysOffNote, 'rebuys-ask': TABLE_COPY.rebuysAskNote, 'rebuy-cap': TABLE_COPY.rebuyCapNote,
};

// Where a leave started: the table's own Leave (the player stays on the page, watching) or the top
// bar's Home (the page goes to "/" once the leave lands).
export type LeaveThen = 'stay' | 'home';

// One button of the leave dialog after Stay, the primary last. `send` is the action it sends:
// 'leave' — at once between hands; mid-hand the hand folds the next time it faces a bet. The
// engine's "leave after this hand" (a later phase) joins here as a second kind, the mid-hand
// primary that never navigates.
export type LeaveAction = {send: 'leave'; label: string; destructive: boolean; navigates: boolean};

export type LeavePlan = {midHand: boolean; title: string; body: string; note: string | null; actions: LeaveAction[]};

// The leave dialog as it reads now — worked out on every render, so a deal that lands while it is
// open turns it into the mid-hand one before the player confirms. Null without a seat, and once the
// viewer has left (mid-hand the seat stays theirs until the hand ends): there is nothing to confirm.
export const leavePlan = (view: Pick<PlayerView, 'seats' | 'hand' | 'status' | 'me' | 'config' | 'ledger'>, then: LeaveThen): LeavePlan | null => {
    const own = ownSeat(view);
    if (own.seat === null || !own.canLeave) return null;
    const buys = view.ledger.find((row) => row.pid === view.me.pid)?.buys ?? 0;
    const ask = leaveAsks(view.config, buys, view.me.isHost);
    const midHand = own.dealtIn;
    // The chips they leave with: those behind (a live pot's are the hand's).
    const body = midHand ? TABLE_COPY.leaveBodyInHand(own.stack) : TABLE_COPY.leaveBody(own.stack);
    const home = then === 'home';
    const label = home ? (midHand ? TABLE_COPY.leaveNowAndGo : TABLE_COPY.leaveAndGo) : midHand ? TABLE_COPY.leaveNow : TABLE_COPY.leave;
    return {
        midHand, title: midHand ? TABLE_COPY.leaveMidHandTitle : TABLE_COPY.leaveTitle, body, note: ask ? LEAVE_NOTES[ask] : null,
        actions: [{send: 'leave', label, destructive: true, navigates: home}],
    };
};

// Whether the break's one-tap Leave asks first: only when sitting down again is not assured.
export const leaveTapAsks = (view: Pick<PlayerView, 'config' | 'ledger' | 'me'>): boolean =>
    leaveAsks(view.config, view.ledger.find((row) => row.pid === view.me.pid)?.buys ?? 0, view.me.isHost) !== null;

// The top bar's Home: straight to "/" for a visitor, a watcher or a player already leaving (folded
// or all in, their plate still says so: MeView.next is what knows); through the leave dialog for
// anyone in a seat, whose table would otherwise wait on a player who is gone.
export const homeAsks = (view: Pick<PlayerView, 'seats' | 'status' | 'me'> | null): boolean => {
    if (!view || view.me.seat === null || view.status === 'closed' || view.me.next === 'leave') return false;
    const seat = view.seats[view.me.seat];
    return seat !== null && seat !== undefined && seat.state !== 'leaving';
};

// After leaving: a player who played tonight and now watches sees their net, the way home and the
// way back to a seat — or why there is none.
export type LeftState = {net: number; sitAgain: boolean; note: string | null};

export const leftState = (view: Pick<PlayerView, 'seats' | 'ledger' | 'status' | 'me' | 'config' | 'removed'>): LeftState | null => {
    if (view.me.seat !== null || view.status === 'closed' || view.removed.includes(view.me.pid)) return null;
    const row = view.ledger.find((r) => r.pid === view.me.pid);
    if (!row || row.bought === 0) return null;
    const ask = leaveAsks(view.config, row.buys, view.me.isHost);
    const open = openSeats(view).length > 0;
    const blocked = ask === 'rebuys-off' || ask === 'rebuy-cap';
    const note = ask === 'rebuys-off' ? REFUSAL_COPY['rebuys-off']
        : ask === 'rebuy-cap' ? REFUSAL_COPY['rebuy-cap']
            : !open ? JOIN_COPY.full
                : ask === 'rebuys-ask' ? TABLE_COPY.rebuysAskNote : null;
    // Out of the seat, the net is what they left with against what they brought.
    return {net: row.cashedOut - row.bought, sitAgain: open && !blocked, note};
};

// ── sitting out: the host's, and how the viewer learns of it ──

// The host's control for each other player (the bank's row and the host drawer's More menu): "Sit
// out next hand" while the player is in the game; once the host asked during the hand in play, a
// note that it waits for the deal (`waiting` is the hand number the host's browser asked during,
// kept by TableOverlays for both places); none for the host, a player already sitting out, away,
// leaving or out of chips, or at a closed table. Nothing takes one back: the view never says who
// asked, so a take-back could deal in a player who asked to sit out themself — dealing a player back
// in is theirs alone ("Deal me in", "I'm back"), and the host's tap on a sit-out the player already
// asked for changes nothing.
export type HostSitOut = 'offer' | 'waiting';

export const hostSitOut = (view: Pick<PlayerView, 'seats' | 'hand' | 'status' | 'me'>, pid: string, waiting: number | null): HostSitOut | null => {
    if (!view.me.isHost || pid === view.me.pid || view.status === 'closed') return null;
    const seat = view.seats.find((s) => s !== null && s.pid === pid);
    if (!seat || seat.state === 'leaving' || seat.state === 'sitting-out' || seat.state === 'away' || seat.state === 'busted') return null;
    const inHand = handLive(view) && (seat.state === 'in-hand' || seat.state === 'all-in' || seat.state === 'folded');
    return inHand && waiting !== null && waiting === view.hand!.no ? 'waiting' : 'offer';
};

// The viewer's own seat, followed from view to view — its state and the viewer's own `next` — to
// tell a sit-out the host made from one of their own. A sit-out is pending once the seat sits out or
// `next` says it will. `asked` from the moment the viewer sends one until it is spent (they are dealt
// in again) or taken back; `byHost` once a sit-out turns up on a seat this page saw with none while
// the viewer had asked for none — here, or (askedHere) from this browser's other tab or before a
// reload (SIT_OUT_ASK_KEY). The view never says who asked, so a page opened on a seat already
// sitting out, or with one already waiting, says nothing of the host.
export type SitOutMemory = {state: SeatView['state'] | null; next: OwnNext; asked: boolean; byHost: boolean};

export const SIT_OUT_MEMORY: SitOutMemory = {state: null, next: null, asked: false, byHost: false};

export type SitOutEvent =
    | {sent: 'sit-out' | 'sit-in'}
    | {refused: 'sit-out'}
    | {state: SeatView['state'] | null; next?: OwnNext; askedHere?: boolean};

const pending = (state: SeatView['state'] | null, next: OwnNext): boolean => state === 'sitting-out' || next === 'sit-out';

export const rememberSitOut = (m: SitOutMemory, e: SitOutEvent): SitOutMemory => {
    if ('sent' in e) {
        const asked = e.sent === 'sit-out';
        return m.asked === asked && !m.byHost ? m : {...m, asked, byHost: false};
    }
    if ('refused' in e) return m.asked ? {...m, asked: false} : m;
    const next = e.next ?? null;
    if (e.state === m.state && next === m.next) return m;
    if (e.state === null) return SIT_OUT_MEMORY;
    const was = pending(m.state, m.next);
    if (!pending(e.state, next)) {
        // Dealt in again: a sit-out the viewer asked for is spent (one still on its way stays asked).
        return {state: e.state, next, asked: was ? false : m.asked, byHost: false};
    }
    if (was) return {...m, state: e.state, next};
    // A sit-out turned up: the host's when this page saw the seat with none and the viewer asked for none.
    const seen = m.state !== null;
    return {state: e.state, next, asked: m.asked, byHost: seen && !m.asked && e.askedHere !== true};
};

// This browser's note of a sit-out the viewer sent, so another tab, or the page after a reload, does
// not take it for the host's: the table's code, the player and when (this browser's clock, read
// against the view's server time — hence either side of it). A sit-out turns up within the hand it
// was asked during, so the note counts for SIT_OUT_ASK_MS only; a sit-in or a refusal clears it.
export const SIT_OUT_ASK_KEY = 'aero-poker-night:sit-out-ask';
export const SIT_OUT_ASK_MS = 30 * 60 * 1000;

export const sitOutAskRecord = (code: string, pid: string, at: number): string => JSON.stringify({code, pid, at});

export const sitOutAsked = (raw: string | null, code: string, pid: string, now: number): boolean => {
    if (!raw) return false;
    try {
        const r = JSON.parse(raw) as {code?: unknown; pid?: unknown; at?: unknown};
        return r.code === code && r.pid === pid && typeof r.at === 'number' && Math.abs(now - r.at) < SIT_OUT_ASK_MS;
    } catch {
        return false;
    }
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
