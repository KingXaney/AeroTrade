// Poker night's engine: one pure reducer over a table's state. Every input that varies — the time,
// the deck, the draw for the first big blind — arrives inside the action, so a step replays exactly.
// The reducer never mutates what it is given: it clones the state once and the step's helpers
// (betting, showdown, ledger) mutate the clone. A step that changes nothing hands back the same
// reference, so the room store can skip the write.
//
// The rules, in short: the big blind always moves on; a seat that sat down or missed hands posts one
// big blind when next dealt in; a player who leaves (or is removed) while facing a bet folds at once,
// and otherwise stays in, away, and is cashed out when the hand completes; a player who chose to
// leave after the hand plays it out as usual and is cashed out when it completes; buys land between
// hands, and once the first hand is dealt every buy but the host's waits for the host's yes — unless
// the room says the host has been away LIMITS.hostTakeoverMs (the action's hostAway), when it lands as
// it would have before the first deal; the host's config applies from the next hand and the room's
// settings at once. Once a hand completes, a
// player who folded it may ask one whose cards were not shown to see them, and only those two ever
// see the ask (asks, below).

import {
    ASK_EVERYONE, ASK_EXPIRED, ASK_NO, ASK_SHOWN, ASK_WAITING, askDeadline, askedHand, asksFull, coolingDown, placeOf,
} from '@/lib/poker-night/asks';
import {isDeck, dealFrom} from '@/lib/poker-night/deck';
import {
    applyMove, commit, foldOutOfTurn, legalFor, owed, pushLog, recheck, settleTurn, snapshotFromState, type Flow,
} from '@/lib/poker-night/betting';
import {
    ASKS, checkConfig, dealable, DEFAULT_CONFIG, DEFAULT_SETTINGS, ENTRY_FLAGS, HOLE_CARDS, mergeConfig, RoomSettingsSchema, TIMING,
} from '@/lib/poker-night/config';
import {cashOut, hasBought, isSettled, ledgerRow, needsHost, recordBuy} from '@/lib/poker-night/ledger';
import {eligibleSeats, isLive, liveSeatOf, positions, seatOf} from '@/lib/poker-night/seats';
import {closeBetting, closeTable, dealStreet, shownHand, summarize} from '@/lib/poker-night/showdown';
import type {
    AskEntry, AskReply, Card, GameConfig, Hand, HostOp, Move, PreAction, Reduced, Refusal, RoomSettings, Seat, TableAction, TableState, Work,
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
        v: 2, status: 'open', closing: false, config: checked.config, configV: 1, settings: room.data, hostPid,
        seats: Array.from({length: checked.config.seats}, () => null), ledger: [], requests: [],
        lastBigBlind: null, button: null, handNo: 0, turn: 0, hand: null, nextHandAt: null, createdAt: at,
        noAsks: [], askCooldowns: [],
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

// Between hands, the next deal is timed while two seats are eligible and this deploy deals the
// table's game (config.dealable), and cleared otherwise; a time already past (the deal could not
// start then) moves to a short delay from now, never into the last hand's results pause.
const reschedule = (w: Work): void => {
    const s = w.state;
    if (s.status !== 'playing' || s.closing || isLive(s.hand)) return;
    if (eligibleSeats(s).length < 2 || !dealable(s.config)) s.nextHandAt = null;
    else if (s.nextHandAt === null || s.nextHandAt < w.at) s.nextHandAt = Math.max(w.at + TIMING.START_DELAY_MS, pauseEnd(s));
};

// A player's request for chips, newest last; a second one takes the place of the first.
const putRequest = (s: TableState, pid: string, amount: number): void => {
    s.requests = [...s.requests.filter((r) => r.pid !== pid), {pid, amount}];
};

const dropRequest = (s: TableState, pid: string): void => {
    s.requests = s.requests.filter((r) => r.pid !== pid);
};

// ── seats and chips ──

// A seat taken. Before the first hand is dealt the chips land at once; after it, a player other than
// the host sits with nothing until the host approves the chips (needsHost): their request waits, and
// a seat at zero is dealt nothing — unless the host has been away long enough (hostAway, which only
// the room sets), when the chips land at once as before the first deal. Sitting again after buying
// chips here is a rebuy, under the policy; a first buy-in never is.
const sit = (w: Work, by: string, i: number, buyIn: number, hostAway: boolean): Refusal | void => {
    const s = w.state;
    if (s.closing) return 'not-now';
    if (!Number.isInteger(i) || i < 0 || i >= s.seats.length) return 'bad-seat';
    if (seatOf(s, by) !== null) return 'already-seated';
    if (s.seats[i]) return 'seat-taken';
    const {buyInMin, buyInMax, rebuys, maxRebuys} = s.config;
    const row = ledgerRow(s, by);
    const again = hasBought(row);
    if (again) {
        if (rebuys === 'off') return 'rebuys-off';
        if (maxRebuys !== null && row!.buys >= maxRebuys) return 'rebuy-cap';
    }
    if (!Number.isSafeInteger(buyIn) || buyIn < 1) return 'bad-amount';
    if (buyIn < buyInMin) return 'below-buy-in';
    if (buyIn > buyInMax) return 'over-cap';
    const seat: Seat = {
        pid: by, stack: 0, sittingOut: false, sitOutNext: false, away: false, timeouts: 0, owesPost: true, leaving: false, removed: false, pendingBuy: 0,
        leaveAfter: false,
    };
    s.seats[i] = seat;
    if (needsHost(s, by) && !hostAway) {
        putRequest(s, by, buyIn);
        return;
    }
    seat.stack = buyIn;
    recordBuy(w, by, buyIn, again ? 'rebuy' : 'buy-in');
};

// Whether `amount` more chips may come to the seat: the policy and the rebuy limit for anything after
// the first buy-in, and the table's range for where the stack (with what waits) would land.
const checkBuy = (s: TableState, seat: Seat, amount: number): Refusal | null => {
    const {rebuys, maxRebuys, buyInMin, buyInMax} = s.config;
    const row = ledgerRow(s, seat.pid);
    const again = hasBought(row);
    if (again && rebuys === 'off') return 'rebuys-off';
    if (!Number.isSafeInteger(amount) || amount < 1) return 'bad-amount';
    if (again && maxRebuys !== null && row!.buys >= maxRebuys) return 'rebuy-cap';
    const projected = seat.stack + seat.pendingBuy + amount;
    if (projected < buyInMin) return 'below-buy-in';
    if (projected > buyInMax) return 'over-cap';
    return null;
};

// Chips for seat i: waiting as a pending buy while the player is in a live hand, landing now
// otherwise (a first buy-in, a rebuy at zero, a top-up above it).
const landBuy = (w: Work, i: number, amount: number): void => {
    const s = w.state;
    const seat = s.seats[i]!;
    if (liveSeatOf(s, seat.pid)) {
        seat.pendingBuy += amount;
        return;
    }
    const kind = !hasBought(ledgerRow(s, seat.pid)) ? 'buy-in' : seat.stack === 0 ? 'rebuy' : 'top-up';
    seat.stack += amount;
    recordBuy(w, seat.pid, amount, kind);
};

// A buy: a request for the host while it needs the host's yes (the same request again changes
// nothing), else the chips land — taking the place of any request of the player's still waiting
// (the host away long enough: the waiting player's "Take N chips").
const buy = (w: Work, by: string, amount: number, hostAway: boolean): Refusal | typeof NOOP | void => {
    const s = w.state;
    const i = seatOf(s, by);
    if (i === null) return 'not-seated';
    const seat = s.seats[i]!;
    if (seat.leaving || seat.leaveAfter || s.closing) return 'not-now';
    const refusal = checkBuy(s, seat, amount);
    if (refusal) return refusal;
    if (needsHost(s, by) && !hostAway) {
        if (s.requests.some((r) => r.pid === by && r.amount === amount)) return NOOP;
        putRequest(s, by, amount);
        return;
    }
    dropRequest(s, by);
    landBuy(w, i, amount);
};

// A player takes back their own request before the host answers it.
const withdraw = (w: Work, by: string): Refusal | void => {
    if (!w.state.requests.some((r) => r.pid === by)) return 'no-request';
    dropRequest(w.state, by);
};

// A player leaves seat i, or the host removes them. Between hands (or not dealt in) they are cashed
// out now. In a live hand: facing a bet they fold at once; otherwise they stay in, away — the clock
// checks or folds for them — and are cashed out when the hand completes. Either way a buy that was
// waiting is dropped, and so is any request; leaving now overrides leaving after the hand.
const depart = (w: Work, i: number, removed: boolean): void => {
    const s = w.state;
    const seat = s.seats[i]!;
    seat.leaveAfter = false;
    dropRequest(s, seat.pid);
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

// Leave the table once the hand in play completes (on), or stay after all (off). While dealt into a
// live hand the player plays it out as usual — not away, nothing forced, pre-actions as ever — and
// is cashed out as it completes; it takes the place of a sit-out asked for and of a request waiting.
// Not in a live hand, "leave after this hand" is leaving now: the one leave every page sends while
// its player stays on it, so a deal that lands first never costs them a blind.
const leaveAfter = (w: Work, by: string, on: boolean): Refusal | typeof NOOP | void => {
    const s = w.state;
    const i = seatOf(s, by);
    if (i === null) return 'not-seated';
    const seat = s.seats[i]!;
    if (seat.leaving) return on ? NOOP : 'not-now';
    if (!liveSeatOf(s, by)) {
        if (!on) return NOOP;
        depart(w, i, false);
        return;
    }
    if (seat.leaveAfter === on) return NOOP;
    seat.leaveAfter = on;
    if (on) {
        seat.sitOutNext = false;
        dropRequest(s, by);
    }
};

const sitOut = (w: Work, by: string): Refusal | typeof NOOP | void => {
    const s = w.state;
    const i = seatOf(s, by);
    if (i === null) return 'not-seated';
    const seat = s.seats[i]!;
    if (seat.leaving) return 'not-now';
    if (liveSeatOf(s, by)) {
        if (seat.sitOutNext && !seat.leaveAfter) return NOOP;
        // Sitting out takes the place of leaving after the hand: the two are never both set.
        seat.sitOutNext = true;
        seat.leaveAfter = false;
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

// ── asks to see a hand ──
//
// Once a hand completes, a player dealt into it who folded may ask a player whose cards were not
// shown (a folded hand, or one that won uncontested) to see them. The player asked answers: their
// cards to the one who asked alone ('one': in that player's view and their history of the hand), to
// everyone ('all': a show), or no. Kept from spam on the server: one ask waiting per player at a
// time, ASKS.PER_HAND a hand; an ask unanswered for ASKS.WAIT_MS counts as a no; after a no the same
// player may not ask the same player again for ASKS.COOLDOWN_HANDS hands; a player who turned asks
// off cannot be asked. Asks live in the hand, so the next deal ends every one — one still waiting
// with time left ends unanswered and leaves no cooldown, since nobody said no and its seconds had not
// run out. The table keeps at most ASKS.COOLDOWNS_KEPT cooldowns and waiting asks together and never
// drops a cooldown before its hands are up: at that cap a new ask is refused ('asks-full') until some
// run out. A card thrown away in Triple T is never shown.

const pidAt = (hand: Hand, seat: number): string => hand.seats.find((p) => p.seat === seat)!.pid;

// After a no: `from` may not ask `to` again until a hand numbered above this one's + COOLDOWN_HANDS.
// Only a cooldown whose hands are up ever goes (the deal prunes those as well): the cap holds because
// every ask that could become a cooldown is counted against it when it is made (asks.asksFull).
const coolDown = (s: TableState, hand: Hand, ask: AskEntry): void => {
    const from = pidAt(hand, ask[0]);
    const to = pidAt(hand, ask[1]);
    const kept = s.askCooldowns.filter(([a, b, until]) => until >= hand.no && !(a === from && b === to));
    s.askCooldowns = [...kept, [from, to, hand.no + ASKS.COOLDOWN_HANDS]];
};

// Every waiting ask whose seconds have run out by `at` is a no.
const expireAsks = (s: TableState, at: number): void => {
    const hand = s.hand;
    if (!hand) return;
    for (const ask of hand.asks) {
        if (ask[3] !== ASK_WAITING || at < askDeadline(hand, ask)) continue;
        ask[3] = ASK_EXPIRED;
        coolDown(s, hand, ask);
    }
};

const ask = (w: Work, by: string, to: string): Refusal | typeof NOOP | void => {
    const s = w.state;
    const hand = askedHand(s);
    if (!hand) return 'not-now';
    const me = placeOf(hand, by);
    if (!me || !me.folded) return 'not-now';
    const them = placeOf(hand, to);
    if (!them || them.pid === by) return 'illegal';
    if (them.shown) return 'not-now';
    if (s.noAsks.includes(to)) return 'asks-off';
    expireAsks(s, w.at);
    const mine = hand.asks.filter((e) => e[0] === me.seat);
    // Asked them already, and it still stands (waiting, or shown to this player): nothing new.
    if (mine.some((e) => e[1] === them.seat && (e[3] === ASK_WAITING || e[3] === ASK_SHOWN))) return NOOP;
    if (mine.some((e) => e[3] === ASK_WAITING)) return 'ask-waiting';
    if (mine.length >= ASKS.PER_HAND) return 'ask-limit';
    if (coolingDown(s, by, to, hand.no)) return 'ask-cooldown';
    if (asksFull(s, hand)) return 'asks-full';
    hand.asks.push([me.seat, them.seat, w.at - hand.startedAt, ASK_WAITING]);
};

// The player in `p`'s place turns their cards face up for the table (a show): every ask to see them
// that was waiting is answered by it.
const showAll = (w: Work, hand: Hand, seat: number): void => {
    const p = hand.seats.find((q) => q.seat === seat)!;
    p.shown = true;
    hand.result!.hands.push(shownHand(p));
    for (const e of hand.asks) if (e[1] === seat && e[3] === ASK_WAITING) e[3] = ASK_EVERYONE;
    pushLog(w, seat, 'show', 0);
    w.hands.push(summarize(hand));
};

const reply = (w: Work, by: string, to: string, show: AskReply): Refusal | void => {
    const s = w.state;
    const hand = askedHand(s);
    if (!hand) return 'not-now';
    const me = placeOf(hand, by);
    if (!me) return 'not-now';
    const them = placeOf(hand, to);
    if (!them) return 'no-request';
    expireAsks(s, w.at);
    const entry = hand.asks.find((e) => e[0] === them.seat && e[1] === me.seat && e[3] === ASK_WAITING);
    if (!entry) return 'no-request';
    switch (show) {
        case 'one':
            entry[3] = ASK_SHOWN;
            // History keeps who saw it (HandSummary.players[].seenBy).
            w.hands.push(summarize(hand));
            return;
        case 'none':
            entry[3] = ASK_NO;
            coolDown(s, hand, entry);
            return;
        case 'all':
            showAll(w, hand, me.seat);
            return;
        default:
            return 'illegal';
    }
};

// "Let others ask to see my cards", for a player with a seat or a place in the hand (the table keeps
// it while they sit, and through the pause of a hand they were dealt; the next deal forgets the
// setting of anyone without a seat: the page sends it again when they sit down).
const allowAsks = (w: Work, by: string, on: boolean): Refusal | typeof NOOP | void => {
    const s = w.state;
    const known = seatOf(s, by) !== null || (s.hand?.seats.some((p) => p.pid === by) ?? false);
    if (!known) return 'not-seated';
    if (on !== s.noAsks.includes(by)) return NOOP;
    s.noAsks = on ? s.noAsks.filter((pid) => pid !== by) : [...s.noAsks, by];
};

// During the results pause any dealt player may turn their cards face up, folded or not.
const show = (w: Work, by: string): Refusal | typeof NOOP | void => {
    const hand = w.state.hand;
    if (!hand || hand.phase !== 'complete' || !hand.result) return 'not-now';
    const p = hand.seats.find((q) => q.pid === by);
    if (!p) return 'not-seated';
    if (p.shown) return NOOP;
    expireAsks(w.state, w.at);
    showAll(w, hand, p.seat);
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
    if (!dealable(s.config)) {
        s.nextHandAt = null;
        return;
    }
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
    // The last hand's asks end with it: one whose seconds had run out is a no, with its cooldown; one
    // still waiting with time left just ends, since nobody said no. Cooldowns past their hands go, and
    // so does the "no asks" setting of anyone no longer seated.
    expireAsks(s, w.at);
    const no = s.handNo + 1;
    s.askCooldowns = s.askCooldowns.filter(([, , until]) => until >= no);
    s.noAsks = s.noAsks.filter((pid) => seatOf(s, pid) !== null);
    // A fresh start — fewer than two eligible seats that owe nothing — posts no extra blinds.
    const fresh = eligible.filter((i) => !s.seats[i]!.owesPost).length < 2;
    const {bb, sb, button, order} = positions(s, eligible, draw);
    const {smallBlind, bigBlind, ante, variant} = s.config;
    const boards = variant === 'plo' ? s.config.boards : 1;
    const {holes, runs} = dealFrom(deck, order.length, HOLE_CARDS[variant], boards);
    const owes = new Set(order.filter((i) => s.seats[i]!.owesPost));
    const hand: Hand = {
        no, startedAt: w.at, variant, button, smallBlindSeat: sb, bigBlindSeat: bb, smallBlind, bigBlind, ante,
        seats: order.map((i, k) => ({
            seat: i, pid: s.seats[i]!.pid, hole: holes[k], startStack: s.seats[i]!.stack, committed: 0, streetBet: 0,
            actedAtBet: null, folded: false, allIn: false, shown: false, pre: null,
        })),
        deck: runs, boards: runs.map(() => []), discards: [], street: 'preflop', phase: 'betting', currentBet: bigBlind, increment: bigBlind,
        lastAggressor: null, actor: null, deadline: null, nextStreetAt: null, log: [], logDropped: 0, result: null, asks: [],
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
            if (!isLive(s.hand) && eligibleSeats(s).length >= 2 && dealable(s.config)) {
                s.nextHandAt = Math.max(s.nextHandAt ?? 0, w.at + TIMING.START_DELAY_MS, pauseEnd(s));
            }
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
            const seat = s.seats[i]!;
            if (seat.leaving || seat.leaveAfter) return 'not-now';
            const refusal = checkBuy(s, seat, request.amount);
            if (refusal) return refusal;
            dropRequest(s, op.pid);
            landBuy(w, i, request.amount);
            return;
        }
        case 'deny':
            if (!s.requests.some((r) => r.pid === op.pid)) return 'no-request';
            dropRequest(s, op.pid);
            return;
        case 'sit-out': {
            // Never the host themself (their own seat has its own sit-out), never someone unseated.
            if (op.pid === s.hostPid) return 'illegal';
            const i = seatOf(s, op.pid);
            if (i === null) return 'not-seated';
            const seat = s.seats[i]!;
            if (seat.leaving) return 'not-now';
            // In the hand in play: from the next deal, like the player's own "Sit out next hand" —
            // nothing to do for one leaving after it; between hands, at once. Only ever out: the
            // state never says who asked, so the host cannot take back a sit-out without overriding
            // one the player asked for — dealing a player back in is theirs alone ("Deal me in",
            // "I'm back").
            if (liveSeatOf(s, op.pid)) {
                if (seat.sitOutNext || seat.leaveAfter) return NOOP;
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
            dropRequest(s, op.pid);
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
            return step(state, at, (w) => sit(w, action.by, action.seat, action.buyIn, action.hostAway === true));
        case 'leave':
            return step(state, at, (w) => leave(w, action.by));
        case 'leave-after':
            return step(state, at, (w) => leaveAfter(w, action.by, action.on));
        case 'sit-out':
            return step(state, at, (w) => sitOut(w, action.by));
        case 'sit-in':
            return step(state, at, (w) => sitIn(w, action.by));
        case 'show':
            return step(state, at, (w) => show(w, action.by));
        case 'buy':
            return step(state, at, (w) => buy(w, action.by, action.amount, action.hostAway === true));
        case 'withdraw':
            return step(state, at, (w) => withdraw(w, action.by));
        case 'ask':
            return step(state, at, (w) => ask(w, action.by, action.to));
        case 'reply':
            return step(state, at, (w) => reply(w, action.by, action.to, action.show));
        case 'allow-asks':
            return step(state, at, (w) => allowAsks(w, action.by, action.on));
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
// request and no place in the current hand — and their "no asks" setting with them. Conservation
// holds, since such a row's bought and cashed out are equal. Hands back the same state when nothing
// goes. The room's join calls it when it lets a departed guest's row go to make room
// (lib/poker-night/room.joinStep).
export const forgetSettled = (state: TableState, pids: readonly string[]): TableState => {
    const gone = new Set(pids.filter((pid) => seatOf(state, pid) === null && !state.requests.some((r) => r.pid === pid)
        && !(state.hand?.seats.some((p) => p.pid === pid) ?? false)));
    if (gone.size === 0) return state;
    const ledger = state.ledger.filter((row) => !(gone.has(row.pid) && isSettled(row)));
    const noAsks = state.noAsks.filter((pid) => !gone.has(pid));
    if (ledger.length === state.ledger.length && noAsks.length === state.noAsks.length) return state;
    return {...state, ledger, noAsks};
};
