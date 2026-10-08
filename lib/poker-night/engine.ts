// Poker night's engine: one pure reducer over a table's state. Every input that varies — the time,
// the deck, the draw for the first big blind — arrives inside the action, so a step replays exactly.
// The reducer never mutates what it is given: it clones the state once and the step's helpers
// (betting, showdown, ledger) mutate the clone. A step that changes nothing hands back the same
// reference, so the room store can skip the write.
//
// The rules, in short: the big blind always moves on; a seat that sat down or missed hands posts one
// big blind when next dealt in; a player who leaves (or is removed) while facing a bet folds at once,
// and otherwise stays in, away, and is cashed out when the hand completes; buys land between hands;
// the host's config applies from the next hand and the room's settings at once.

import {isDeck, dealFrom} from '@/lib/poker-night/deck';
import {
    applyMove, commit, foldOutOfTurn, legalFor, owed, pushLog, recheck, settleTurn, snapshotFromState, type Flow,
} from '@/lib/poker-night/betting';
import {checkConfig, DEFAULT_CONFIG, DEFAULT_SETTINGS, ENTRY_FLAGS, mergeConfig, RoomSettingsSchema, TIMING} from '@/lib/poker-night/config';
import {cashOut, isSettled, ledgerRow, recordBuy} from '@/lib/poker-night/ledger';
import {eligibleSeats, isLive, liveSeatOf, positions, seatOf} from '@/lib/poker-night/seats';
import {closeBetting, closeTable, dealStreet, shownHand, summarize} from '@/lib/poker-night/showdown';
import type {
    Card, GameConfig, Hand, HostOp, Move, PreAction, Reduced, Refusal, RoomSettings, Seat, TableAction, TableState, Work,
} from '@/lib/poker-night/types';

export const createTable = ({hostPid, config = DEFAULT_CONFIG, settings = DEFAULT_SETTINGS, at}: {
    hostPid: string;
    config?: GameConfig;
    settings?: RoomSettings;
    at: number;
}): TableState => {
    const checked = checkConfig(config);
    if (!checked.ok) throw new RangeError(`bad config: ${checked.issues.map((i) => `${i.path} ${i.message}`).join(', ')}`);
    const room = RoomSettingsSchema.safeParse(settings);
    if (!room.success) throw new RangeError('bad room settings');
    return {
        v: 1, status: 'open', closing: false, config: checked.config, configV: 1, settings: room.data, hostPid,
        seats: Array.from({length: checked.config.seats}, () => null), ledger: [], requests: [],
        lastBigBlind: null, button: null, handNo: 0, turn: 0, hand: null, nextHandAt: null, createdAt: at,
    };
};

// A step's body returns a refusal, NOOP when it would change nothing, or nothing when it changed the
// copy.
const NOOP = 'noop';
type Body = (w: Work) => Refusal | typeof NOOP | void;

const workOn = (state: TableState, at: number): Work => ({state: structuredClone(state), at, hands: [], ledgerDirty: false});

const step = (state: TableState, at: number, body: Body, kicked: string | null = null): Reduced => {
    const w = workOn(state, at);
    const r = body(w);
    if (r === NOOP) return {ok: true, state, hands: [], ledgerDirty: false, kicked};
    if (r) return {ok: false, reason: r};
    reschedule(w);
    return {ok: true, state: w.state, hands: w.hands, ledgerDirty: w.ledgerDirty, kicked};
};

const follow = (w: Work, flow: Flow): void => {
    if (flow === 'close') closeBetting(w);
};

// When the last hand's results pause ends: its reveal or the host's pause, whichever is longer (0
// before the first hand). It lies in the past once the pause is over, so it holds back only a deal
// timed during it.
const pauseEnd = (s: TableState): number => {
    const result = s.hand?.result ?? null;
    return result ? result.completedAt + Math.max(s.config.pauseSeconds * 1000, result.revealMs) : 0;
};

// Between hands, the next deal is timed while two seats are eligible and cleared otherwise; a time
// already past (the deal could not start then) moves to a short delay from now, never into the last
// hand's results pause.
const reschedule = (w: Work): void => {
    const s = w.state;
    if (s.status !== 'playing' || s.closing || isLive(s.hand)) return;
    if (eligibleSeats(s).length < 2) s.nextHandAt = null;
    else if (s.nextHandAt === null || s.nextHandAt < w.at) s.nextHandAt = Math.max(w.at + TIMING.START_DELAY_MS, pauseEnd(s));
};

const putRequest = (s: TableState, pid: string, amount: number, at: number): void => {
    s.requests = [...s.requests.filter((r) => r.pid !== pid), {pid, amount, at}];
};

// ── seats and chips ──

const sit = (w: Work, by: string, i: number, buyIn: number): Refusal | void => {
    const s = w.state;
    if (s.closing) return 'not-now';
    if (!Number.isInteger(i) || i < 0 || i >= s.seats.length) return 'bad-seat';
    if (seatOf(s, by) !== null) return 'already-seated';
    if (s.seats[i]) return 'seat-taken';
    const {buyInMin, buyInMax, rebuys, maxRebuys} = s.config;
    // A ledger row means they have sat here before: sitting again is a rebuy, under the policy.
    const row = ledgerRow(s, by);
    if (row) {
        if (rebuys === 'off') return 'rebuys-off';
        if (maxRebuys !== null && row.buys >= maxRebuys) return 'rebuy-cap';
    }
    if (!Number.isSafeInteger(buyIn) || buyIn < 1) return 'bad-amount';
    if (buyIn < buyInMin) return 'below-buy-in';
    if (buyIn > buyInMax) return 'over-cap';
    const seat: Seat = {pid: by, stack: 0, sittingOut: false, sitOutNext: false, away: false, timeouts: 0, owesPost: true, leaving: false, removed: false, pendingBuy: 0};
    s.seats[i] = seat;
    if (row && rebuys === 'approve' && by !== s.hostPid) {
        putRequest(s, by, buyIn, w.at);
        return;
    }
    seat.stack = buyIn;
    recordBuy(w, by, buyIn, row ? 'rebuy' : 'buy-in');
};

const checkBuy = (s: TableState, seat: Seat, amount: number): Refusal | null => {
    const {rebuys, maxRebuys, buyInMin, buyInMax} = s.config;
    if (rebuys === 'off') return 'rebuys-off';
    if (!Number.isSafeInteger(amount) || amount < 1) return 'bad-amount';
    const row = ledgerRow(s, seat.pid);
    if (row && maxRebuys !== null && row.buys >= maxRebuys) return 'rebuy-cap';
    const projected = seat.stack + seat.pendingBuy + amount;
    if (projected < buyInMin) return 'below-buy-in';
    if (projected > buyInMax) return 'over-cap';
    return null;
};

// Chips for seat i: waiting as a pending buy while the player is in a live hand, landing now
// otherwise (a rebuy at zero, a top-up above it).
const landBuy = (w: Work, i: number, amount: number): void => {
    const seat = w.state.seats[i]!;
    if (liveSeatOf(w.state, seat.pid)) {
        seat.pendingBuy += amount;
        return;
    }
    const kind = seat.stack === 0 ? 'rebuy' : 'top-up';
    seat.stack += amount;
    recordBuy(w, seat.pid, amount, kind);
};

const buy = (w: Work, by: string, amount: number): Refusal | void => {
    const s = w.state;
    const i = seatOf(s, by);
    if (i === null) return 'not-seated';
    const seat = s.seats[i]!;
    if (seat.leaving || s.closing) return 'not-now';
    const refusal = checkBuy(s, seat, amount);
    if (refusal) return refusal;
    if (s.config.rebuys === 'approve' && by !== s.hostPid) putRequest(s, by, amount, w.at);
    else landBuy(w, i, amount);
};

// A player leaves seat i, or the host removes them. Between hands (or not dealt in) they are cashed
// out now. In a live hand: facing a bet they fold at once; otherwise they stay in, away — the clock
// checks or folds for them — and are cashed out when the hand completes. Either way a buy that was
// waiting is dropped, and so is any request.
const depart = (w: Work, i: number, removed: boolean): void => {
    const s = w.state;
    const seat = s.seats[i]!;
    s.requests = s.requests.filter((r) => r.pid !== seat.pid);
    const p = liveSeatOf(s, seat.pid);
    if (!p) {
        cashOut(w, i, removed ? 'removed' : 'cash-out');
        return;
    }
    seat.leaving = true;
    seat.away = true;
    seat.removed = seat.removed || removed;
    seat.pendingBuy = 0;
    p.pre = null;
    const hand = s.hand!;
    if (hand.phase !== 'betting') return;
    if (!p.folded && !p.allIn && owed(hand, i) > 0) foldOutOfTurn(w, i);
    follow(w, recheck(w));
};

const leave = (w: Work, by: string): Refusal | typeof NOOP | void => {
    const i = seatOf(w.state, by);
    if (i === null) return 'not-seated';
    if (w.state.seats[i]!.leaving) return NOOP;
    depart(w, i, false);
};

const sitOut = (w: Work, by: string): Refusal | typeof NOOP | void => {
    const s = w.state;
    const i = seatOf(s, by);
    if (i === null) return 'not-seated';
    const seat = s.seats[i]!;
    if (seat.leaving) return 'not-now';
    if (liveSeatOf(s, by)) {
        if (seat.sitOutNext) return NOOP;
        seat.sitOutNext = true;
    } else {
        if (seat.sittingOut) return NOOP;
        seat.sittingOut = true;
    }
};

const sitIn = (w: Work, by: string): Refusal | typeof NOOP | void => {
    const s = w.state;
    const i = seatOf(s, by);
    if (i === null) return 'not-seated';
    const seat = s.seats[i]!;
    if (seat.leaving) return 'not-now';
    if (!seat.sittingOut && !seat.sitOutNext && !seat.away && seat.timeouts === 0) return NOOP;
    seat.sittingOut = false;
    seat.sitOutNext = false;
    seat.away = false;
    seat.timeouts = 0;
};

// During the results pause any dealt player may turn their cards face up, folded or not.
const show = (w: Work, by: string): Refusal | typeof NOOP | void => {
    const hand = w.state.hand;
    if (!hand || hand.phase !== 'complete' || !hand.result) return 'not-now';
    const p = hand.seats.find((q) => q.pid === by);
    if (!p) return 'not-seated';
    if (p.shown) return NOOP;
    p.shown = true;
    hand.result.hands.push(shownHand(hand, p));
    pushLog(w, p.seat, 'show', 0);
    w.hands.push(summarize(hand));
};

// ── the hand ──

const act = (w: Work, by: string, turn: number, move: Move): Refusal | void => {
    const s = w.state;
    const i = seatOf(s, by);
    if (i === null) return 'not-seated';
    if (turn !== s.turn) return 'stale';
    const hand = s.hand;
    if (!isLive(hand) || hand.phase !== 'betting' || hand.actor !== i) return 'not-your-turn';
    if (hand.deadline !== null && w.at >= hand.deadline + TIMING.TURN_GRACE_MS) return 'stale';
    const refusal = applyMove(w, i, move, 'player');
    if (refusal) return refusal;
    follow(w, settleTurn(w, i));
};

const PRE_KINDS: readonly PreAction['kind'][] = ['check-fold', 'check', 'call', 'call-any'];

const setPre = (w: Work, by: string, pre: PreAction | null): Refusal | typeof NOOP | void => {
    const s = w.state;
    const i = seatOf(s, by);
    if (i === null) return 'not-seated';
    const hand = s.hand;
    const p = liveSeatOf(s, by);
    if (!hand || !p || hand.phase !== 'betting' || p.folded || p.allIn || hand.actor === i) return 'not-now';
    if (pre === null) {
        if (p.pre === null) return NOOP;
        p.pre = null;
        return;
    }
    if (!PRE_KINDS.includes(pre.kind)) return 'illegal';
    const due = owed(hand, i);
    if (pre.kind === 'check' && due > 0) return 'illegal';
    if (pre.kind === 'call') {
        if (due === 0) return 'illegal';
        // The amount the player saw: anything else means the bet moved since.
        if (pre.amount !== Math.min(due, s.seats[i]!.stack)) return 'stale';
    }
    const next = pre.kind === 'call' ? {kind: 'call' as const, amount: pre.amount, atBet: hand.currentBet} : {kind: pre.kind, atBet: hand.currentBet};
    if (JSON.stringify(next) === JSON.stringify(p.pre)) return NOOP;
    p.pre = next;
};

const startHand = (w: Work, deck: Card[], draw: number): void => {
    const s = w.state;
    for (const seat of s.seats) {
        if (seat && (seat.sitOutNext || seat.away)) {
            seat.sittingOut = true;
            seat.sitOutNext = false;
        }
    }
    const eligible = eligibleSeats(s);
    s.seats.forEach((seat, i) => {
        if (seat && !eligible.includes(i)) seat.owesPost = true;
    });
    if (eligible.length < 2) {
        s.nextHandAt = null;
        return;
    }
    // A fresh start — fewer than two eligible seats that owe nothing — posts no extra blinds.
    const fresh = eligible.filter((i) => !s.seats[i]!.owesPost).length < 2;
    const {bb, sb, button, order} = positions(s, eligible, draw);
    const {holes, board} = dealFrom(deck, order.length);
    const {smallBlind, bigBlind, ante} = s.config;
    const owes = new Set(order.filter((i) => s.seats[i]!.owesPost));
    const hand: Hand = {
        no: s.handNo + 1, startedAt: w.at, button, smallBlindSeat: sb, bigBlindSeat: bb, smallBlind, bigBlind, ante,
        seats: order.map((i, k) => ({
            seat: i, pid: s.seats[i]!.pid, hole: holes[k], startStack: s.seats[i]!.stack, committed: 0, streetBet: 0,
            actedAtBet: null, folded: false, allIn: false, shown: false, pre: null,
        })),
        deck: board, board: [], street: 'preflop', phase: 'betting', currentBet: bigBlind, increment: bigBlind,
        lastAggressor: null, actor: null, deadline: null, nextStreetAt: null, log: [], logDropped: 0, result: null,
    };
    s.hand = hand;
    s.handNo = hand.no;
    s.button = button;
    s.lastBigBlind = bb;
    s.nextHandAt = null;
    for (const i of order) {
        const seat = s.seats[i]!;
        seat.owesPost = false;
        ledgerRow(s, seat.pid)!.hands++;
    }
    const post = (i: number, amount: number, kind: 'ante' | 'small-blind' | 'big-blind' | 'post') => {
        const paid = Math.min(s.seats[i]!.stack, amount);
        if (paid <= 0) return;
        commit(w, i, paid, kind !== 'ante');
        pushLog(w, i, kind, paid, s.seats[i]!.stack === 0 ? ENTRY_FLAGS.allIn : 0);
    };
    if (ante > 0) for (const i of order) post(i, ante, 'ante');
    // A seat that owes a post and lands in the small blind posts a full big blind instead.
    if (owes.has(sb) && !fresh && order.length > 2) post(sb, bigBlind, 'post');
    else post(sb, smallBlind, 'small-blind');
    post(bb, bigBlind, 'big-blind');
    if (!fresh) for (const i of order) if (owes.has(i) && i !== sb && i !== bb) post(i, bigBlind, 'post');
    follow(w, settleTurn(w, bb));
};

// Time ran out on the actor: check if that is free, else fold. Enough in a row and they are away.
const timeout = (w: Work, turn: number): Refusal | void => {
    const s = w.state;
    const hand = s.hand;
    if (!isLive(hand) || hand.phase !== 'betting' || hand.actor === null) return 'not-now';
    if (turn !== s.turn) return 'stale';
    if (hand.deadline === null || w.at < hand.deadline + TIMING.TURN_GRACE_MS) return 'not-due';
    const i = hand.actor;
    const legal = legalFor(snapshotFromState(s), i)!;
    applyMove(w, i, legal.check ? {kind: 'check'} : {kind: 'fold'}, 'timeout');
    const seat = s.seats[i]!;
    seat.timeouts++;
    if (seat.timeouts >= s.config.sitOutAfter) seat.away = true;
    follow(w, settleTurn(w, i));
};

const voidHand = (w: Work): void => {
    const s = w.state;
    const hand = s.hand!;
    let total = 0;
    for (const p of hand.seats) {
        s.seats[p.seat]!.stack += p.committed;
        total += p.committed;
        p.committed = 0;
        p.streetBet = 0;
        p.pre = null;
    }
    pushLog(w, -1, 'void', total);
    hand.phase = 'complete';
    hand.actor = null;
    hand.deadline = null;
    hand.nextStreetAt = null;
    hand.currentBet = 0;
    hand.result = {completedAt: w.at, showdown: false, refund: null, pots: [], hands: [], showOrder: [], nets: hand.seats.map((p) => ({seat: p.seat, net: 0})), revealMs: 0};
};

// ── the host ──

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const host = (w: Work, by: string, op: HostOp): Refusal | typeof NOOP | void => {
    const s = w.state;
    if (by !== s.hostPid) return 'not-host';
    switch (op.op) {
        case 'start':
            if (s.status !== 'open') return 'not-now';
            s.status = 'playing';
            return;
        case 'pause':
            if (s.status !== 'playing') return 'not-now';
            s.status = 'paused';
            return;
        case 'resume':
            if (s.status !== 'paused') return 'not-now';
            s.status = 'playing';
            if (!isLive(s.hand) && eligibleSeats(s).length >= 2) s.nextHandAt = Math.max(s.nextHandAt ?? 0, w.at + TIMING.START_DELAY_MS, pauseEnd(s));
            return;
        case 'end':
            if (s.closing) return NOOP;
            s.closing = true;
            // No chips land at a closing table: a buy waiting on the live hand and every request go.
            for (const seat of s.seats) if (seat) seat.pendingBuy = 0;
            s.requests = [];
            if (!isLive(s.hand)) closeTable(w);
            return;
        case 'config': {
            const patch = (op.patch ?? {}) as Partial<GameConfig>;
            if (typeof patch !== 'object' || (patch.seats !== undefined && patch.seats !== s.config.seats)) return 'bad-config';
            const checked = checkConfig(mergeConfig(s.config, patch));
            if (!checked.ok) return 'bad-config';
            if (sameJson(checked.config, s.config)) return NOOP;
            s.config = checked.config;
            s.configV++;
            return;
        }
        case 'settings': {
            const merged = {...s.settings};
            for (const [key, value] of Object.entries(op.patch ?? {})) if (value !== undefined) (merged as Record<string, unknown>)[key] = value;
            const parsed = RoomSettingsSchema.safeParse(merged);
            if (!parsed.success) return 'bad-config';
            if (sameJson(parsed.data, s.settings)) return NOOP;
            s.settings = parsed.data;
            return;
        }
        case 'approve': {
            if (s.closing) return 'not-now';
            const request = s.requests.find((r) => r.pid === op.pid);
            if (!request) return 'no-request';
            const i = seatOf(s, op.pid);
            if (i === null) return 'not-seated';
            if (s.seats[i]!.leaving) return 'not-now';
            const refusal = checkBuy(s, s.seats[i]!, request.amount);
            if (refusal) return refusal;
            s.requests = s.requests.filter((r) => r.pid !== op.pid);
            landBuy(w, i, request.amount);
            return;
        }
        case 'deny':
            if (!s.requests.some((r) => r.pid === op.pid)) return 'no-request';
            s.requests = s.requests.filter((r) => r.pid !== op.pid);
            return;
        case 'sit-out': {
            // Never the host themself (their own seat has its own sit-out), never someone unseated.
            if (op.pid === s.hostPid) return 'illegal';
            const i = seatOf(s, op.pid);
            if (i === null) return 'not-seated';
            const seat = s.seats[i]!;
            if (seat.leaving) return 'not-now';
            // In the hand in play: from the next deal, like the player's own "Sit out next hand";
            // between hands, at once. Only ever out: the state never says who asked, so the host
            // cannot take back a sit-out without overriding one the player asked for — dealing a
            // player back in is theirs alone ("Deal me in", "I'm back").
            if (liveSeatOf(s, op.pid)) {
                if (seat.sitOutNext) return NOOP;
                seat.sitOutNext = true;
                return;
            }
            if (seat.sittingOut) return NOOP;
            seat.sittingOut = true;
            seat.sitOutNext = false;
            return;
        }
        case 'kick': {
            if (op.pid === s.hostPid) return 'illegal';
            const i = seatOf(s, op.pid);
            if (i !== null) {
                const seat = s.seats[i]!;
                if (seat.leaving && seat.removed) return NOOP;
                depart(w, i, true);
                return;
            }
            // A watcher: nothing at the table but any request.
            if (!s.requests.some((r) => r.pid === op.pid)) return NOOP;
            s.requests = s.requests.filter((r) => r.pid !== op.pid);
            return;
        }
        default:
            return 'illegal';
    }
};

export const reduce = (state: TableState, action: TableAction): Reduced => {
    if (!Number.isSafeInteger(action.at) || action.at < 0) return {ok: false, reason: 'illegal'};
    if (state.status === 'closed') return {ok: false, reason: 'closed'};
    const at = action.at;
    switch (action.type) {
        case 'sit':
            return step(state, at, (w) => sit(w, action.by, action.seat, action.buyIn));
        case 'leave':
            return step(state, at, (w) => leave(w, action.by));
        case 'sit-out':
            return step(state, at, (w) => sitOut(w, action.by));
        case 'sit-in':
            return step(state, at, (w) => sitIn(w, action.by));
        case 'show':
            return step(state, at, (w) => show(w, action.by));
        case 'buy':
            return step(state, at, (w) => buy(w, action.by, action.amount));
        case 'act':
            return step(state, at, (w) => act(w, action.by, action.turn, action.move));
        case 'pre':
            return step(state, at, (w) => setPre(w, action.by, action.pre));
        case 'host': {
            const kicked = action.op.op === 'kick' && action.by === state.hostPid && action.op.pid !== state.hostPid ? action.op.pid : null;
            return step(state, at, (w) => host(w, action.by, action.op), kicked);
        }
        case 'timeout':
            return step(state, at, (w) => timeout(w, action.turn));
        case 'deal-street':
            return step(state, at, (w) => {
                const hand = w.state.hand;
                if (!isLive(hand) || hand.phase !== 'runout') return 'not-now';
                if (hand.nextStreetAt !== null && w.at < hand.nextStreetAt) return 'not-due';
                dealStreet(w);
            });
        case 'start-hand':
            return step(state, at, (w) => {
                const s = w.state;
                if (!isDeck(action.deck) || !Number.isSafeInteger(action.draw) || action.draw < 0) return 'bad-deck';
                if (s.status !== 'playing' || s.closing || isLive(s.hand) || s.nextHandAt === null) return 'not-now';
                if (w.at < s.nextHandAt) return 'not-due';
                startHand(w, [...action.deck], action.draw);
            });
        default:
            return {ok: false, reason: 'illegal'};
    }
};

// Closes the table whatever is happening (an idle room): a live hand is called off, every chip in
// it going back where it came from, and everyone is cashed out.
export const forceClose = (state: TableState, at: number): TableState => {
    if (state.status === 'closed') return state;
    const w = workOn(state, at);
    if (isLive(w.state.hand)) voidHand(w);
    closeTable(w);
    return w.state;
};

// Lets the ledger rows of players the room has forgotten go: among `pids`, the settled rows
// (ledger.isSettled: no hand dealt, every chip bought cashed out) of players with no seat, no
// request and no place in the current hand. Conservation holds, since such a row's bought and
// cashed out are equal. Hands back the same state when no row goes. The room's join calls it when it
// lets a departed guest's row go to make room (lib/poker-night/room.joinStep).
export const forgetSettled = (state: TableState, pids: readonly string[]): TableState => {
    const gone = new Set(pids.filter((pid) => seatOf(state, pid) === null && !state.requests.some((r) => r.pid === pid)
        && !(state.hand?.seats.some((p) => p.pid === pid) ?? false)));
    if (gone.size === 0) return state;
    const ledger = state.ledger.filter((row) => !(gone.has(row.pid) && isSettled(row)));
    return ledger.length === state.ledger.length ? state : {...state, ledger};
};
