// What the table's overlays offer, worked out from the view: the top bar's own-seat choices (leaving
// after this hand among them), the leave dialog, the join card's state, the invite's deal button,
// the host drawer's people, controls and settings form, the bank's own-chips buttons, what each
// request for chips is for and which are new, its "chips in, by time" list, asks to see a hand as the
// seat menu, the prompt and the toasts read them, and the drawers closing when a turn comes round. Pure and client-safe: components/poker-night/TableOverlays and the pieces it mounts
// draw what these return and send what the player picks through the table's routes, and the server
// checks every one of them again.

import {BANK_COPY, JOIN_COPY, OVERLAY_COPY, REFUSAL_COPY, TABLE_COPY} from '@/lib/learn/copy/poker-night';
import {buyOptions, type BankRow} from '@/lib/poker-night/bank';
import {parseChips} from '@/lib/poker-night/bet-sizing';
import {ASKS, checkConfig, mergeConfig} from '@/lib/poker-night/config';
import {configIssueText, TIMER_PRESETS} from '@/lib/poker-night/lobby';
import type {AskAnswer, BoardCount, GameConfig, LedgerKind, RebuyPolicy, Variant} from '@/lib/poker-night/types';
import type {AskBlock, AskView, JoinOutcome, JoinView, MeView, OwnNext, People, PlayerView, Presence, SeatView, TableView} from '@/lib/poker-night/view-types';
import {ledgerRowOf, ledgerRows} from '@/lib/poker-night/views';

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

// What asks for the viewer now, as a key — their turn to act ("turn:12"), or a card of theirs to
// throw away in Triple T's throw-away ("discard:7", by the hand) — else null. Each new one closes any
// drawer or dialog the viewer has open, so nothing modal stands over the action bar or the cards to
// pick from while the clock runs, and chimes once.
export const attentionKey = (view: Pick<PlayerView, 'hand' | 'turn' | 'me'> | null): string | null => {
    if (!view || view.me.seat === null || !view.hand) return null;
    const hand = view.hand;
    if (hand.phase === 'betting' && hand.actor === view.me.seat) return `turn:${view.turn}`;
    if (hand.phase === 'discard' && hand.toDiscard.includes(view.me.seat) && view.me.hole !== null) return `discard:${hand.no}`;
    return null;
};

// ── the viewer's own seat (the top bar's menu) ──

// Between hands the seat can sit out, come back after sitting out, or come back from away; during
// a hand "sit out next hand" (the engine keeps that for the next deal), and once that waits, "deal me
// in", which takes it back. Nothing once the viewer has left the hand in play (MeView.next 'leave'):
// the seat is cashed out when it ends; nor while they leave after it ('leave-after'), which "Stay at
// the table" takes back.
export type SeatChoice = 'sit-out' | 'deal-me-in' | 'back';

// "Leave after this hand", the menu's toggle and the dock's: offered while the viewer holds cards in
// the hand in play, 'set' while they leave after it (Stay takes it back).
export type LeaveAfter = 'offer' | 'set';

export type OwnSeat = {
    seat: number | null;
    chips: number; // a live pot included
    stack: number; // behind
    dealtIn: boolean; // holds cards in the hand in play: leaving now folds them at the next bet
    choice: SeatChoice | null;
    canLeave: boolean;
    leaveAfter: LeaveAfter | null;
    canTakeSeat: boolean; // a watcher, with a seat open
};

// Whether the viewer has left the hand in play for good (now, not after it): the seat reads Leaving,
// or — folded or all in, the plate still saying so — their own part says 'leave'.
export const leftNow = (view: Pick<PlayerView, 'seats' | 'me'>): boolean => {
    const s = view.me.seat === null ? null : view.seats[view.me.seat] ?? null;
    return s !== null && (s.state === 'leaving' || view.me.next === 'leave');
};

// "Leave after this hand" as the viewer may use it now: set while they leave after it; offered while
// they hold cards in the hand in play, have not left it and the table is open. Once they fold, the
// break's Leave sends it (one tap: there is nothing left to lose in the hand).
export const leaveAfterOf = (view: Pick<PlayerView, 'seats' | 'hand' | 'status' | 'me'>): LeaveAfter | null => {
    if (view.me.seat === null || view.status === 'closed' || leftNow(view)) return null;
    if (view.me.next === 'leave-after') return 'set';
    return holdsCards(view, view.me.seat) ? 'offer' : null;
};

export const ownSeat = (view: Pick<PlayerView, 'seats' | 'hand' | 'status' | 'me'>): OwnSeat => {
    const seat = view.me.seat;
    const s = seat === null ? null : view.seats[seat] ?? null;
    const closed = view.status === 'closed';
    if (!s) {
        return {seat: null, chips: 0, stack: 0, dealtIn: false, choice: null, canLeave: false, leaveAfter: null, canTakeSeat: !closed && openSeats(view).length > 0};
    }
    const leaving = leftNow(view);
    const leaveAfter = leaveAfterOf(view);
    const waits = view.me.next === 'sit-out' && handLive(view);
    const choice: SeatChoice | null = closed || leaving || leaveAfter === 'set' ? null
        : s.state === 'away' ? 'back'
            : s.state === 'sitting-out' || waits ? 'deal-me-in'
                : 'sit-out';
    return {seat, chips: seatChips(s), stack: s.chips, dealtIn: holdsCards(view, seat), choice, canLeave: !closed && !leaving, leaveAfter, canTakeSeat: false};
};

// ── leaving, and the way home ──

// What sitting down again would take, said before a player leaves: rebuys are off, they need the
// host's yes (anyone but the host once the first hand is dealt: ledger.needsHost), or this player has
// had every rebuy the table allows (sitting again is a rebuy: engine.sit). Null when sitting down
// again simply works.
export type LeaveAsk = 'rebuys-off' | 'rebuys-ask' | 'rebuy-cap';

export const leaveAsks = (config: Pick<GameConfig, 'rebuys' | 'maxRebuys'>, buys: number, isHost: boolean, started: boolean): LeaveAsk | null => {
    if (config.rebuys === 'off') return 'rebuys-off';
    if (config.maxRebuys !== null && buys >= config.maxRebuys) return 'rebuy-cap';
    if (started && !isHost) return 'rebuys-ask';
    return null;
};

const LEAVE_NOTES: Record<LeaveAsk, string> = {
    'rebuys-off': TABLE_COPY.rebuysOffNote, 'rebuys-ask': TABLE_COPY.rebuysAskNote, 'rebuy-cap': TABLE_COPY.rebuyCapNote,
};

// Where a leave started: the table's own Leave (the player stays on the page, watching) or the top
// bar's Home (the page goes to "/" once the leave lands).
export type LeaveThen = 'stay' | 'home';

// One button of the leave dialog after Stay, the primary last. `send` is the action it sends:
// 'leave-after' — every leave that keeps the player on the page: between hands it leaves at once,
// and should a deal land first they play that hand out and leave as it ends, so the race never costs
// them a blind; mid-hand it is "Leave after this hand", which never navigates. 'leave' — "Leave now"
// mid-hand (the hand folds the next time it faces a bet) and a leave that goes home, whose page is
// about to go.
export type LeaveAction = {send: 'leave' | 'leave-after'; label: string; destructive: boolean; navigates: boolean};

// afterNote: what "Leave after this hand" does, said under the body while the dialog offers it.
export type LeavePlan = {midHand: boolean; title: string; body: string; note: string | null; afterNote: string | null; actions: LeaveAction[]};

// The leave dialog as it reads now — worked out on every render, so a deal that lands while it is
// open turns it into the mid-hand one before the player confirms. Null without a seat, and once the
// viewer has left (mid-hand the seat stays theirs until the hand ends): there is nothing to confirm.
// Mid-hand it offers both ways: now, or after this hand (unless they chose that already).
export const leavePlan = (view: Pick<PlayerView, 'seats' | 'hand' | 'status' | 'me' | 'config' | 'ledger' | 'handNo'>, then: LeaveThen): LeavePlan | null => {
    const own = ownSeat(view);
    if (own.seat === null || !own.canLeave) return null;
    const buys = ledgerRowOf(view, view.me.pid)?.buys ?? 0;
    const ask = leaveAsks(view.config, buys, view.me.isHost, view.handNo > 0);
    const midHand = own.dealtIn;
    // The chips they leave with: those behind (a live pot's are the hand's).
    const body = midHand ? TABLE_COPY.leaveBodyInHand(own.stack) : TABLE_COPY.leaveBody(own.stack);
    const home = then === 'home';
    const after: LeaveAction | null = midHand && own.leaveAfter === 'offer'
        ? {send: 'leave-after', label: TABLE_COPY.leaveAfter, destructive: false, navigates: false} : null;
    const now: LeaveAction = home
        ? {send: 'leave', label: midHand ? TABLE_COPY.leaveNowAndGo : TABLE_COPY.leaveAndGo, destructive: true, navigates: true}
        : midHand
            ? {send: 'leave', label: TABLE_COPY.leaveNow, destructive: true, navigates: false}
            : {send: 'leave-after', label: TABLE_COPY.leave, destructive: true, navigates: false};
    // Staying on the page, the gentler way is the primary, last; going home, the way that goes is.
    const actions = !after ? [now] : home ? [after, now] : [now, after];
    return {
        midHand, title: midHand ? TABLE_COPY.leaveMidHandTitle : TABLE_COPY.leaveTitle, body, note: ask ? LEAVE_NOTES[ask] : null,
        afterNote: after ? TABLE_COPY.leaveAfterNote : null, actions,
    };
};

// A "leave after this hand" sent between hands, as its answer reads: still seated and leaving after
// a hand — a deal landed first, which the table says once (TABLE_COPY.leaveLanded); else it left.
export const leaveAfterLanded = (view: Pick<PlayerView, 'me'>): boolean => view.me.seat !== null && view.me.next === 'leave-after';

// Whether the break's one-tap Leave asks first: only when there is no way back to a seat (rebuys
// off, or every rebuy used). Once a hand is dealt sitting down again needs the host's yes for anyone
// but the host — every guest's leave then — which the left panel says after, never a dialog before.
export const leaveTapAsks = (view: Pick<PlayerView, 'config' | 'ledger' | 'me' | 'handNo'>): boolean => {
    const ask = leaveAsks(view.config, ledgerRowOf(view, view.me.pid)?.buys ?? 0, view.me.isHost, view.handNo > 0);
    return ask === 'rebuys-off' || ask === 'rebuy-cap';
};

// The top bar's Home: straight to "/" for a visitor, a watcher or a player already leaving (folded
// or all in, their plate still says so: MeView.next is what knows); through the leave dialog for
// anyone in a seat, whose table would otherwise wait on a player who is gone.
export const homeAsks = (view: Pick<PlayerView, 'seats' | 'status' | 'me'> | null): boolean => {
    if (!view || view.me.seat === null || view.status === 'closed' || leftNow(view)) return false;
    return view.seats[view.me.seat] != null;
};

// After leaving: a player who played tonight and now watches sees their net, the way home and the
// way back to a seat — or why there is none.
export type LeftState = {net: number; sitAgain: boolean; note: string | null};

export const leftState = (view: Pick<PlayerView, 'seats' | 'ledger' | 'status' | 'me' | 'config' | 'removed' | 'handNo'>): LeftState | null => {
    if (view.me.seat !== null || view.status === 'closed' || view.removed.includes(view.me.pid)) return null;
    const row = ledgerRowOf(view, view.me.pid);
    if (!row || row.bought === 0) return null;
    const ask = leaveAsks(view.config, row.buys, view.me.isHost, view.handNo > 0);
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
    outcome: JoinOutcome, renamed: string | null, view: Pick<PlayerView, 'seats' | 'hand' | 'me' | 'requests'>, asked: 'player' | 'watcher',
): string[] => {
    const notes: string[] = [];
    if (renamed !== null) notes.push(JOIN_COPY.renamed(renamed));
    if (outcome === 'moved') notes.push(JOIN_COPY.seatTaken);
    if (outcome === 'full') notes.push(JOIN_COPY.full);
    if (outcome === 'watching' && asked === 'watcher') notes.push(JOIN_COPY.watching);
    const seat = view.me.seat === null ? null : view.seats[view.me.seat] ?? null;
    if ((outcome === 'seated' || outcome === 'moved') && seat) {
        // Chips that wait for the host's yes: said in place of when they are dealt in.
        if (view.requests.some((r) => r.pid === view.me.pid)) {
            notes.push(TABLE_COPY.waitingApproval);
            return notes;
        }
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
    const ledger = new Map(ledgerRows(view).map((row) => [row.pid, row]));
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

// The settings form: the chip figures as typed, the rest as chosen — the game and its boards too.
export type GameForm = {
    smallBlind: string;
    bigBlind: string;
    ante: string;
    buyInMin: string;
    buyInMax: string;
    turnSeconds: number;
    rebuys: RebuyPolicy;
    maxRebuys: number | null;
    variant: Variant;
    boards: BoardCount;
};

export type GameField = keyof GameForm;
export const GAME_FIELDS: readonly GameField[] = ['variant', 'boards', 'smallBlind', 'bigBlind', 'ante', 'buyInMin', 'buyInMax', 'turnSeconds'];
export const REBUY_FIELDS: readonly GameField[] = ['rebuys', 'maxRebuys'];

const plain = (n: number): string => String(n);

export const gameFormOf = (c: GameConfig): GameForm => ({
    smallBlind: plain(c.smallBlind), bigBlind: plain(c.bigBlind), ante: plain(c.ante),
    buyInMin: plain(c.buyInMin), buyInMax: plain(c.buyInMax), turnSeconds: c.turnSeconds, rebuys: c.rebuys, maxRebuys: c.maxRebuys,
    variant: c.variant, boards: c.boards,
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
            case 'variant': values.variant = form.variant; break;
            // More than one board is PLO's alone: any other game is one.
            case 'boards': values.boards = form.variant === 'plo' ? form.boards : 1; break;
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
    offer: {min: number; max: number; topUp: number; rebuy: boolean; first: boolean} | null;
    asksHost: boolean; // a buy here waits for the host's yes
    used: number; // rebuys so far
    maxRebuys: number | null;
};

// Whether a buy by the viewer waits for the host's yes: once the first hand is dealt, for anyone but
// the host (ledger.needsHost) — however long the host has been gone (claim-host is the way on).
export const buyAsksHost = (view: Pick<PlayerView, 'me' | 'handNo'>): boolean => !view.me.isHost && view.handNo > 0;

// The viewer's own chips and what they may add, by the table's rules (bank.buyOptions, the client's
// copy of the server's own check); null without a seat.
export const ownChips = (view: Pick<PlayerView, 'seats' | 'ledger' | 'requests' | 'config' | 'me' | 'handNo'>): OwnChips | null => {
    const seat = view.me.seat;
    const s = seat === null ? null : view.seats[seat] ?? null;
    if (seat === null || !s) return null;
    const row = ledgerRowOf(view, view.me.pid);
    const used = row?.buys ?? 0;
    const requested = view.requests.find((r) => r.pid === view.me.pid)?.amount ?? null;
    return {
        seat, stack: seatChips(s), behind: s.chips, inPot: s.inPot, pendingBuy: s.pendingBuy, requested,
        offer: requested === null ? buyOptions(view.config, s, row, view.me.next === 'leave' || view.me.next === 'leave-after') : null,
        asksHost: buyAsksHost(view),
        used, maxRebuys: view.config.maxRebuys,
    };
};

export type TimelineItem = {key: string; pid: string; name: string; at: number; kind: LedgerKind; amount: number};

// "Chips in, by time": every player's latest bank events, newest first.
export const bankTimeline = (rows: readonly Pick<BankRow, 'pid' | 'name' | 'events'>[], limit = 40): TimelineItem[] =>
    rows.flatMap((row) => row.events.map((e, i) => ({key: `${row.pid}:${i}:${e.at}`, pid: row.pid, name: row.name, at: e.at, kind: e.kind, amount: e.amount})))
        .sort((a, b) => b.at - a.at || a.key.localeCompare(b.key))
        .slice(0, limit);

// How a request for chips the viewer was waiting on ended: their chips went up (approved); it went
// with the viewer's own doing (withdrawn) — their Cancel (`withdrawn`, which the page marks as it
// sends one), or a leave, now or after the hand, which takes a request with it (no seat, or
// `leaving`); else the host's no (declined). Only a decline is said as the host's.
export type RequestOutcome = 'approved' | 'declined' | 'withdrawn';

export const requestEnded = (
    before: {bought: number},
    after: {bought: number; pendingBuy: number; seated: boolean; leaving: boolean; withdrawn: boolean},
): RequestOutcome => {
    if (after.bought > before.bought || after.pendingBuy > 0) return 'approved';
    return after.withdrawn || !after.seated || after.leaving ? 'withdrawn' : 'declined';
};

// ── the host's waiting requests (a dot on the menu icon) ──

export const waitingRequests = (table: Pick<TableView, 'requests'>, me: Pick<MeView, 'isHost'> | null): number =>
    me?.isHost ? table.requests.length : 0;

// What a request for chips is for, as the host's row and toast say it: a new player's first chips
// (they sit with none until the host says yes), a rebuy at zero, or a top-up.
export type RequestKind = 'seat' | 'rebuy' | 'top-up';

export const requestKind = (view: Pick<TableView, 'seats' | 'ledger'>, pid: string): RequestKind => {
    const bought = (ledgerRowOf(view, pid)?.bought ?? 0) > 0;
    if (!bought) return 'seat';
    const seat = view.seats.find((s) => s !== null && s.pid === pid) ?? null;
    return !seat || seat.chips + seat.pendingBuy + seat.inPot === 0 ? 'rebuy' : 'top-up';
};

// The host's alerts as a view of the requests arrives, against the last one seen. Each request new
// since (its player had none waiting) gets a toast with Approve, and one whose amount changed has its
// toast said again, in place, with the new amount (`fresh` false) — Approve always names the amount it
// approves (the engine refuses one changed since: stale). The short sound plays for a new request
// only, and at most once per player in REQUEST_SOUND_MS (`heard`: when each player's last sounded),
// so a player who keeps taking a request back and asking again — at most once every
// REQUESTS.CHANGE_MS, which the server holds — never floods the host with sounds.
export const REQUEST_SOUND_MS = 20_000;

type RequestFigures = {pid: string; amount: number};
export type RequestAlerts = {toast: (RequestFigures & {fresh: boolean})[]; sound: boolean; heard: Readonly<Record<string, number>>};
export const NO_REQUESTS_HEARD: Readonly<Record<string, number>> = Object.freeze({});

export const requestAlerts = (
    before: readonly RequestFigures[], after: readonly RequestFigures[], heard: Readonly<Record<string, number>>, now: number,
): RequestAlerts => {
    const toast: RequestAlerts['toast'] = [];
    const next: Record<string, number> = Object.fromEntries(Object.entries(heard).filter(([, at]) => now - at < REQUEST_SOUND_MS));
    let sound = false;
    for (const r of after) {
        const was = before.find((b) => b.pid === r.pid);
        if (was && was.amount === r.amount) continue;
        toast.push({pid: r.pid, amount: r.amount, fresh: !was});
        if (was || next[r.pid] !== undefined) continue;
        sound = true;
        next[r.pid] = now;
    }
    return {toast, sound, heard: next};
};

// ── asks to see a hand ──

// How an ask stands at `now`: one still waiting past its time is a no ('expired') before any write
// says so — as lib/poker-night/asks.answerAt reads the server's own.
export const answerNow = (ask: Pick<AskView, 'answer' | 'until'>, now: number): AskAnswer =>
    ask.answer === 'waiting' && now >= ask.until ? 'expired' : ask.answer;

// What another player's seat menu offers about their cards: an ask (the viewer may ask them now),
// the ask greyed with why not (MeView.askBlocked), how the viewer's ask of them stands, or nothing —
// the viewer may ask nobody (a hand being played, or they were not dealt into the last one or did not
// fold it). Read at `now`, so an ask of the viewer's that ran out frees the rest (unless that was
// every ask a hand allows) and reads as expired, with no write between.
export type AskOffer = {kind: 'ask'} | {kind: 'blocked'; block: AskBlock} | {kind: 'asked'; answer: AskAnswer} | null;

export const askOffer = (me: Pick<MeView, 'pid' | 'asks' | 'canAsk' | 'askBlocked'>, pid: string, now: number): AskOffer => {
    const mine = me.asks.filter((a) => a.from === me.pid);
    const asked = mine.find((a) => a.to === pid);
    if (asked) return {kind: 'asked', answer: answerNow(asked, now)};
    const waiting = mine.some((a) => answerNow(a, now) === 'waiting');
    if (me.canAsk.includes(pid)) return waiting ? {kind: 'blocked', block: 'waiting'} : {kind: 'ask'};
    const block = me.askBlocked.find(([p]) => p === pid)?.[1] ?? null;
    if (block === null) return null;
    if (block === 'waiting' && !waiting) return mine.length >= ASKS.PER_HAND ? {kind: 'blocked', block: 'limit'} : {kind: 'ask'};
    return {kind: 'blocked', block};
};

// When an ask really ends for the player asked: its own seconds, or the next deal if that comes
// first — every ask ends at the deal (with no cooldown when its seconds were not up), so the
// prompt's countdown runs to whichever is sooner. A paused table deals nothing.
export const askEndsAt = (ask: Pick<AskView, 'until'>, table: Pick<TableView, 'status' | 'nextHandAt'>): number =>
    table.status === 'playing' && table.nextHandAt !== null ? Math.min(ask.until, table.nextHandAt) : ask.until;

// The ask the viewer is to answer now: the oldest one to them still waiting with time left before it
// runs out or the next deal ends it (askEndsAt), else null.
export const askToAnswer = (me: Pick<MeView, 'pid' | 'asks'>, now: number, table: Pick<TableView, 'status' | 'nextHandAt'> | null = null): AskView | null =>
    me.asks.find((a) => a.to === me.pid && answerNow(a, now) === 'waiting' && (table === null || now < askEndsAt(a, table))) ?? null;


// Whether an ask of the viewer's own still waits for its answer at `now` (the page then reads the
// clock each second, to say when it runs out).
export const askWaiting = (me: Pick<MeView, 'pid' | 'asks'>, now: number): boolean =>
    me.asks.some((a) => (a.from === me.pid || a.to === me.pid) && answerNow(a, now) === 'waiting');

// The viewer's own asks as this page last saw each one (by askKey), with the hand they were about;
// askNews says which got their answer since — said once each, in a toast. An ask still waiting when
// the next hand is dealt ends with it ('dealt': no answer, which keeps the one who asked from asking
// that player again for ASKS.COOLDOWN_HANDS hands, as a no does), which only the hand moving on can
// say, since the ask leaves the view with the hand.
export type AskSeen = Readonly<{hand: number | null; asks: Readonly<Record<string, {ask: AskView; answer: AskAnswer}>>}>;
export const NO_ASKS_SEEN: AskSeen = Object.freeze({hand: null, asks: Object.freeze({})});
export type AskNews = {ask: AskView; answer: AskAnswer | 'dealt'};

export const askKey = (ask: Pick<AskView, 'from' | 'to' | 'at'>): string => `${ask.from}>${ask.to}@${ask.at}`;

export const askNews = (seen: AskSeen, me: Pick<MeView, 'pid' | 'asks'>, now: number, hand: number | null): {news: AskNews[]; seen: AskSeen} => {
    const news: AskNews[] = [];
    const before = seen.hand === hand ? seen.asks : {};
    if (seen.hand !== null && seen.hand !== hand) {
        for (const {ask, answer} of Object.values(seen.asks)) if (answer === 'waiting') news.push({ask, answer: 'dealt'});
    }
    const next: Record<string, {ask: AskView; answer: AskAnswer}> = {};
    for (const ask of me.asks) {
        if (ask.from !== me.pid) continue;
        const key = askKey(ask);
        const answer = answerNow(ask, now);
        next[key] = {ask, answer};
        if (before[key]?.answer === 'waiting' && answer !== 'waiting') news.push({ask, answer});
    }
    const same = seen.hand === hand && Object.keys(next).length === Object.keys(seen.asks).length
        && Object.entries(next).every(([k, a]) => seen.asks[k]?.answer === a.answer);
    return {news, seen: same ? seen : {hand, asks: next}};
};
