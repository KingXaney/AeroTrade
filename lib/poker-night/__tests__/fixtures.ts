// What the poker night engine tests share: a table built in one line, a deck stacked so a test names
// the hole cards and board it wants, a runner that fails loudly on a refusal, a deep freeze that
// proves the reducer never mutates its input, the invariants every state must keep, and seeded
// random play over the legal moves.

import {parseCardList, type Card} from '@/lib/poker/cards';
import {allInOpen, legalFor, snapshotFromState} from '@/lib/poker-night/betting';
import {advance, nextDue} from '@/lib/poker-night/clock';
import {DEFAULT_CONFIG, HOLE_CARDS} from '@/lib/poker-night/config';
import {FULL_DECK, shuffleWith} from '@/lib/poker-night/deck';
import {createTable, reduce} from '@/lib/poker-night/engine';
import {conservation} from '@/lib/poker-night/ledger';
import {eligibleSeats, isLive, positions} from '@/lib/poker-night/seats';
import type {GameConfig, Move, PreAction, Reduced, Seat, TableAction, TableState, Variant} from '@/lib/poker-night/types';
import {mulberry32} from '@/lib/random';

export const T0 = 1_790_000_000_000;

export const pidOf = (seat: number): string => `p${seat}`;

export const cards = (text: string): Card[] => {
    const parsed = parseCardList(text);
    if (parsed.unknown.length > 0 || parsed.repeated.length > 0) throw new Error(`bad cards: ${text}`);
    return parsed.cards;
};

// A full 52-card deck in dealFrom's layout for a hand dealt in `order` with h hole cards each: the
// named seats get the named holes, the board (or board k of `boards`) is the named cards, and every
// other place takes the unused cards from the top (aces first, so filler is easy to tell apart from
// the low cards tests name).
export const stacked = (order: readonly number[], spec: {holes?: Record<number, string>; board?: string; boards?: string[]}, h = 2): Card[] => {
    const n = order.length;
    const deck: (Card | null)[] = new Array(52).fill(null);
    const used = new Set<Card>();
    const place = (at: number, card: Card) => {
        if (used.has(card)) throw new Error(`card ${card} named twice`);
        used.add(card);
        deck[at] = card;
    };
    order.forEach((seat, k) => {
        const hole = spec.holes?.[seat];
        if (!hole) return;
        const named = cards(hole);
        if (named.length !== h) throw new Error(`seat ${seat} named ${named.length} hole cards, not ${h}`);
        named.forEach((card, j) => place(h * k + j, card));
    });
    const boards = spec.boards ?? (spec.board ? [spec.board] : []);
    boards.forEach((board, b) => cards(board).forEach((card, j) => place(h * n + 5 * b + j, card)));
    let next = 51;
    for (let i = 0; i < 52; i++) {
        if (deck[i] !== null) continue;
        while (used.has(next)) next--;
        place(i, next);
    }
    return deck as Card[];
};

export const freshSeat = (pid: string, stack: number): Seat =>
    ({pid, stack, sittingOut: false, sitOutNext: false, away: false, timeouts: 0, owesPost: false, leaving: false, removed: false, pendingBuy: 0, leaveAfter: false});

// A playing table with player p<i> in seat i holding stacks[i], as if each had bought in exactly
// that and played a hand already (nobody owes a post). The host is p0 unless named.
export const table = (stacks: Record<number, number>, opts: {config?: Partial<GameConfig>; host?: string; lastBigBlind?: number | null} = {}): TableState => {
    const config = {...DEFAULT_CONFIG, ...opts.config};
    const s = createTable({hostPid: opts.host ?? 'p0', config, at: T0});
    for (const [key, stack] of Object.entries(stacks)) {
        const i = Number(key);
        s.seats[i] = freshSeat(pidOf(i), stack);
        s.ledger.push({pid: pidOf(i), bought: stack, cashedOut: 0, buys: 0, events: [[0, 0, stack]], hands: 0, wins: 0, biggestWin: 0, allIns: 0, peakChips: stack});
    }
    s.status = 'playing';
    s.lastBigBlind = opts.lastBigBlind ?? null;
    s.nextHandAt = T0;
    return s;
};

export const ok = (r: Reduced, what = 'step'): TableState => {
    if (!r.ok) throw new Error(`${what} refused: ${r.reason}`);
    return r.state;
};

export const play = (state: TableState, ...actions: TableAction[]): TableState =>
    actions.reduce((s, action) => ok(reduce(s, action), `${action.type} ${JSON.stringify(action)}`), state);

// The moment the current actor went on the clock, else the next deal's time: tests act "now".
export const nowOf = (state: TableState): number => {
    const hand = state.hand;
    if (isLive(hand) && hand.deadline !== null) return hand.deadline - state.config.turnSeconds * 1000;
    if (isLive(hand) && hand.nextStreetAt !== null) return hand.nextStreetAt;
    return state.nextHandAt ?? hand?.result?.completedAt ?? T0;
};

// Deals the next hand from a deck stacked for its seats, in the table's game.
export const deal = (state: TableState, spec: {holes?: Record<number, string>; board?: string; boards?: string[]; draw?: number; at?: number} = {}): TableState => {
    const draw = spec.draw ?? 0;
    const eligible = eligibleSeats(state);
    const {order} = positions(state, eligible, draw);
    const deck = stacked(order, spec, HOLE_CARDS[state.config.variant]);
    return ok(reduce(state, {type: 'start-hand', deck, draw, at: spec.at ?? nowOf(state)}), 'start-hand');
};

export const F: Move = {kind: 'fold'};
export const X: Move = {kind: 'check'};
export const C: Move = {kind: 'call'};
export const A: Move = {kind: 'all-in'};
export const R = (to: number): Move => ({kind: 'raise', to});

export const actorPid = (state: TableState): string => {
    const actor = state.hand?.actor;
    if (actor === null || actor === undefined) throw new Error('nobody is on the clock');
    return state.seats[actor]!.pid;
};

export const actBy = (state: TableState, pid: string, move: Move, at = nowOf(state)): Extract<TableAction, {type: 'act'}> =>
    ({type: 'act', by: pid, turn: state.turn, move, at});

// Each move by whoever is on the clock, in turn.
export const moves = (state: TableState, ...list: Move[]): TableState =>
    list.reduce((s, move) => ok(reduce(s, actBy(s, actorPid(s), move)), `move ${JSON.stringify(move)} by ${actorPid(s)}`), state);

// Runs the all-in run-out to the showdown on its own clock.
export const runOut = (state: TableState): TableState => {
    let s = state;
    while (isLive(s.hand) && s.hand.phase === 'runout') s = ok(reduce(s, {type: 'deal-street', at: s.hand.nextStreetAt!}), 'deal-street');
    return s;
};

export const host = (state: TableState, op: Extract<TableAction, {type: 'host'}>['op'], at = nowOf(state)): Reduced =>
    reduce(state, {type: 'host', by: state.hostPid, op, at});

export const deepFreeze = <T>(value: T): T => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value);
        for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
    }
    return value;
};

// What every state must keep, whatever happened: the chips add up, every number is a whole,
// non-negative chip count where it should be, no card is dealt twice, the actor really has to act,
// and the state survives a JSON round trip.
export const checkInvariants = (s: TableState): void => {
    const c = conservation(s);
    if (!c.ok) throw new Error(`conservation: ${JSON.stringify(c)}`);
    const chip = (n: number, what: string) => {
        if (!Number.isSafeInteger(n) || n < 0) throw new Error(`${what} = ${n}`);
    };
    for (const seat of s.seats) if (seat) {
        chip(seat.stack, 'stack');
        chip(seat.pendingBuy, 'pendingBuy');
    }
    for (const row of s.ledger) for (const key of ['bought', 'cashedOut', 'buys', 'hands', 'wins', 'biggestWin', 'allIns', 'peakChips'] as const) chip(row[key], key);
    const hand = s.hand;
    if (hand) {
        const seen = new Set<number>();
        for (const card of [...hand.deck.flat(), ...hand.seats.flatMap((p) => p.hole), ...hand.discards.map(([, c]) => c)]) {
            if (seen.has(card)) throw new Error(`card ${card} dealt twice`);
            seen.add(card);
        }
        for (const p of hand.seats) {
            chip(p.committed, 'committed');
            chip(p.streetBet, 'streetBet');
            if (p.streetBet > p.committed) throw new Error('street bet above committed');
        }
        if (isLive(hand)) {
            if (hand.phase === 'betting') {
                if (hand.actor === null) throw new Error('betting with nobody on the clock');
                const legal = legalFor(snapshotFromState(s), hand.actor);
                if (!legal) throw new Error('the actor has no moves');
                const top = Math.max(...hand.seats.map((p) => p.streetBet));
                if (hand.currentBet < top) throw new Error('a street bet above the current bet');
            }
            if (hand.seats.length === 2 && hand.smallBlindSeat !== hand.button) throw new Error('heads-up small blind is not the button');
            for (const p of hand.seats) if (s.seats[p.seat]?.pid !== p.pid) throw new Error('a dealt seat changed hands mid-hand');
        }
    }
    const pids = s.seats.filter((x) => x !== null).map((x) => x!.pid);
    if (new Set(pids).size !== pids.length) throw new Error('a player sits twice');
    if (JSON.stringify(JSON.parse(JSON.stringify(s))) !== JSON.stringify(s)) throw new Error('JSON round trip');
};

// A seeded night at a random table: moves from the legal set, and between them players sitting
// down, leaving, being removed, sitting out and in, buying chips, setting pre-actions and showing
// cards, the host approving, pausing and changing the config, and the clock running whatever falls
// due. Yields every state with the action (or clock step) that made it; refusals are part of the
// night too and leave the state as it was. The game is Texas hold'em unless named.
export function* randomNight(seed: number, steps: number, variant: Variant = 'holdem'): Generator<{state: TableState; action: TableAction | 'clock'; refused: string | null}> {
    const random = mulberry32(seed);
    const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)];
    const seats = 2 + Math.floor(random() * 8);
    const bigBlind = pick([2, 20, 50, 100]);
    const buyInMax = bigBlind * pick([20, 50, 100]);
    const config: GameConfig = {
        ...DEFAULT_CONFIG, seats, smallBlind: Math.max(1, bigBlind / 2), bigBlind, ante: random() < 0.3 ? Math.max(1, Math.floor(bigBlind / 4)) : 0,
        buyInMin: Math.max(bigBlind, Math.floor(buyInMax / 4)), buyInMax, rebuys: pick(['approve', 'approve', 'off'] as const),
        maxRebuys: random() < 0.3 ? 3 : null, sitOutAfter: 1 + Math.floor(random() * 2), variant,
    };
    let s = createTable({hostPid: 'p0', config, at: T0});
    let now = T0;
    const pool = Array.from({length: seats + 3}, (_, i) => pidOf(i));
    const source = {deck: () => shuffleWith(FULL_DECK, (max) => Math.floor(random() * max)), draw: () => Math.floor(random() * 1e6)};
    const apply = (action: TableAction) => {
        deepFreeze(s);
        const r = reduce(s, action);
        if (r.ok) s = r.state;
        return r.ok ? null : r.reason;
    };
    const free = () => s.seats.flatMap((seat, i) => (seat ? [] : [i]));
    const seated = () => s.seats.flatMap((seat) => (seat ? [seat.pid] : []));
    // Seat most of the pool and start.
    for (const pid of pool.slice(0, Math.min(seats, 2 + Math.floor(random() * seats)))) {
        apply({type: 'sit', by: pid, seat: pick(free()), buyIn: config.buyInMin + Math.floor(random() * (config.buyInMax - config.buyInMin + 1)), at: now});
    }
    apply({type: 'host', by: 'p0', op: {op: 'start'}, at: now});
    for (let k = 0; k < steps; k++) {
        const hand = s.hand;
        const roll = random();
        if (isLive(hand) && hand.phase === 'betting' && roll < 0.7) {
            const action = actBy(s, actorPid(s), randomMove(s, random), now);
            const refused = apply(action);
            yield {state: s, action, refused};
            continue;
        }
        if (roll < 0.85 || !isLive(hand)) {
            const due = nextDueOf(s);
            if (due !== null && roll < 0.95) {
                now = Math.max(now, due) + Math.floor(random() * 500);
                deepFreeze(s);
                s = advance(s, now, source).state;
                yield {state: s, action: 'clock', refused: null};
                continue;
            }
        }
        now += Math.floor(random() * 1000);
        const anyone = pick(pool);
        const sitting = seated();
        const someone = sitting.length > 0 ? pick(sitting) : anyone;
        const event = pick(['sit', 'sit', 'leave', 'kick', 'sit-out', 'sit-in', 'buy', 'buy', 'approve', 'approve', 'deny', 'pause', 'resume', 'config', 'pre', 'show', 'end'] as const);
        let action: TableAction;
        switch (event) {
            case 'sit': {
                const open = free();
                action = {type: 'sit', by: anyone, seat: open.length > 0 ? pick(open) : 0, buyIn: config.buyInMin + Math.floor(random() * (config.buyInMax - config.buyInMin + 1)), at: now};
                break;
            }
            case 'leave': case 'sit-out': case 'sit-in': case 'show':
                action = {type: event, by: someone, at: now};
                break;
            case 'kick':
                action = {type: 'host', by: 'p0', op: {op: 'kick', pid: anyone}, at: now};
                break;
            case 'buy':
                action = {type: 'buy', by: someone, amount: 1 + Math.floor(random() * s.config.buyInMax), at: now};
                break;
            case 'approve': case 'deny':
                action = {type: 'host', by: 'p0', op: {op: event, pid: s.requests.length > 0 ? pick(s.requests).pid : anyone}, at: now};
                break;
            case 'pause': case 'resume':
                action = {type: 'host', by: random() < 0.9 ? 'p0' : anyone, op: {op: event}, at: now};
                break;
            case 'end':
                if (random() < 0.9) continue;
                action = {type: 'host', by: 'p0', op: {op: 'end'}, at: now};
                break;
            case 'config':
                action = {type: 'host', by: 'p0', op: {op: 'config', patch: random() < 0.5 ? {turnSeconds: 15 + Math.floor(random() * 60)} : {rebuys: pick(['approve', 'off'] as const), ante: random() < 0.5 ? 0 : Math.max(1, Math.floor(s.config.bigBlind / 5))}}, at: now};
                break;
            case 'pre': {
                const kinds: PreAction[] = [{kind: 'check-fold'}, {kind: 'check'}, {kind: 'call-any'}, {kind: 'call', amount: 1 + Math.floor(random() * bigBlind * 3)}];
                action = {type: 'pre', by: someone, pre: random() < 0.1 ? null : pick(kinds), at: now};
                break;
            }
        }
        const refused = apply(action);
        yield {state: s, action, refused};
        if (s.status === 'closed') return;
    }
}

const nextDueOf = (s: TableState): number | null => nextDue(s)?.at ?? null;

// A seeded pick among the actor's legal moves: mostly checks and calls, some raises and folds; all in
// only where it is open (in PLO, within the pot limit), else a raise to the most allowed.
export const randomMove = (state: TableState, random: () => number): Move => {
    const snapshot = snapshotFromState(state);
    const legal = legalFor(snapshot, state.hand!.actor!)!;
    const roll = random();
    if (legal.raise && roll < 0.08) return allInOpen(legal, snapshot, state.hand!.actor!) ? {kind: 'all-in'} : {kind: 'raise', to: legal.raise.max};
    if (legal.raise && roll < 0.25) {
        const {min, max} = legal.raise;
        const to = roll < 0.18 ? min : min + Math.floor(random() * (max - min + 1));
        return {kind: 'raise', to};
    }
    if (!legal.check && roll < 0.4) return {kind: 'fold'};
    return legal.check ? {kind: 'check'} : {kind: 'call'};
};
