// Poker night's engine over seeded random nights. Each night is a random table — 2 to 9 seats, with
// or without an ante, any rebuy policy — played with random legal moves, and between them players
// sitting down, leaving, being removed, sitting out and in, buying chips, setting pre-actions and
// showing cards, and the host approving, pausing, resuming and changing the config; the lazy clock
// runs whatever falls due, dealing from a seeded deck source.
//
// After every step: the chips add up, every number is a whole, non-negative count, nobody sits twice
// and no card is dealt twice, the player on the clock is live, holds chips and has to act, and the
// moves they are offered are exactly the ones a replay of the street's log allows; and the reducer
// never touched its frozen input. At every completed hand: the pots match a chip-by-chip reference,
// add up to what was left in after the uncalled bet came back, and each goes to the strongest
// eligible hands, and the state survives a JSON round trip into the stored shape. Across hands the
// big blind moves one eligible seat on, so nobody pays it twice running and nobody twice in one
// orbit of another player. A night replays to the same final state from its recorded actions.
//
// 100 nights of up to 60 hands by default; PN_SIM_SEEDS=1000 runs more.

import {describe, expect, it} from 'vitest';
import {evaluateCards} from '@/lib/poker/evaluator';
import {legalFor, needsToAct, owed, snapshotFromState} from '@/lib/poker-night/betting';
import {advance, nextDue} from '@/lib/poker-night/clock';
import {DEFAULT_CONFIG, ENTRY_FLAGS, ENTRY_KINDS, STREETS, TABLE_LIMITS} from '@/lib/poker-night/config';
import {FULL_DECK, shuffleWith, type DeckSource} from '@/lib/poker-night/deck';
import {createTable, forceClose, reduce} from '@/lib/poker-night/engine';
import {buyRange, conservation} from '@/lib/poker-night/ledger';
import {migrateState} from '@/lib/poker-night/migrate';
import {eligibleSeats, isLive, liveSeatOf} from '@/lib/poker-night/seats';
import type {GameConfig, HostOp, Legal, Move, PreAction, TableAction, TableState} from '@/lib/poker-night/types';
import {mulberry32} from '@/lib/random';
import {deepFreeze, pidOf, T0} from './fixtures';

const DEFAULT_SEEDS = 100;
const SEEDS = Math.max(DEFAULT_SEEDS, Number(process.env.PN_SIM_SEEDS) || 0);
const HANDS = 60;
const MAX_STEPS = HANDS * 150;

type Random = {next: () => number; int: (n: number) => number; pick: <T>(list: readonly T[]) => T; chance: (p: number) => boolean};

const randomOf = (seed: number): Random => {
    const next = mulberry32(seed);
    const int = (n: number) => Math.floor(next() * n);
    return {next, int, pick: (list) => list[int(list.length)], chance: (p) => next() < p};
};

// The night's decks and first-big-blind draws come from a stream of their own, so a replay rebuilds
// the same source from the seed alone.
const deckSource = (seed: number): DeckSource => {
    const next = mulberry32(seed * 7919 + 17);
    return {deck: () => shuffleWith(FULL_DECK, (max) => Math.floor(next() * max)), draw: () => Math.floor(next() * 2 ** 31)};
};

// Small chip counts keep the chip-by-chip pot reference quick.
const BIG_BLINDS = [1, 2, 4, 10, 20, 50];

const randomConfig = (r: Random): GameConfig => {
    const {min, max} = TABLE_LIMITS.seats;
    const bigBlind = r.pick(BIG_BLINDS.slice(1));
    const buyInMax = bigBlind * r.pick([20, 50, 100]);
    return {
        ...DEFAULT_CONFIG,
        seats: min + r.int(max - min + 1),
        smallBlind: r.pick([1, bigBlind / 2, bigBlind / 2, bigBlind]),
        bigBlind,
        ante: r.chance(0.4) ? r.pick([1, Math.max(1, Math.floor(bigBlind / 4)), bigBlind]) : 0,
        buyInMin: r.chance(0.3) ? buyInMax : bigBlind * r.pick([1, 10, 20]),
        buyInMax,
        rebuys: r.pick(['auto', 'auto', 'approve', 'off'] as const),
        maxRebuys: r.chance(0.3) ? 1 + r.int(3) : null,
        turnSeconds: TABLE_LIMITS.turnSeconds.min + r.int(TABLE_LIMITS.turnSeconds.max - TABLE_LIMITS.turnSeconds.min + 1),
        pauseSeconds: TABLE_LIMITS.pauseSeconds.min + r.int(TABLE_LIMITS.pauseSeconds.max - TABLE_LIMITS.pauseSeconds.min + 1),
        sitOutAfter: 1 + r.int(TABLE_LIMITS.sitOutAfter.max),
    };
};

// A config change the host might make; now and then one out of limits, which is refused.
const randomPatch = (c: GameConfig, r: Random): Extract<HostOp, {op: 'config'}>['patch'] => {
    switch (r.int(8)) {
        case 0: return {turnSeconds: r.chance(0.9) ? 15 + r.int(106) : 5};
        case 1: return {pauseSeconds: 3 + r.int(13)};
        case 2: return {sitOutAfter: 1 + r.int(5)};
        case 3: return {rebuys: r.pick(['off', 'auto', 'approve'] as const)};
        case 4: return {maxRebuys: r.chance(0.5) ? null : 1 + r.int(4)};
        case 5: return {ante: r.chance(0.5) ? 0 : 1 + r.int(c.bigBlind + 1)};
        case 6: {
            const fits = BIG_BLINDS.filter((bb) => bb <= c.buyInMin && c.buyInMax <= TABLE_LIMITS.buyIn.bigBlinds * bb);
            const bigBlind = fits.length > 0 ? r.pick(fits) : c.buyInMin + 1;
            return {bigBlind, smallBlind: Math.max(1, Math.floor(bigBlind / 2)), ante: Math.min(c.ante, bigBlind)};
        }
        default: {
            const buyInMax = c.bigBlind * (20 + r.int(81));
            return {buyInMax, buyInMin: Math.max(c.bigBlind, buyInMax - r.int(buyInMax))};
        }
    }
};

// Mostly checks and calls, some folds and raises (at the minimum, a little above, or anything up to
// all in), and the odd all-in.
const randomMove = (legal: Legal, r: Random): Move => {
    const roll = r.next();
    if ((legal.raise || legal.callAllIn) && roll < 0.05) return {kind: 'all-in'};
    if (legal.raise && roll < 0.2) {
        const {min, max} = legal.raise;
        const span = max - min;
        const to = roll < 0.12 ? min : roll < 0.17 ? min + r.int(Math.floor(span / 4) + 1) : min + r.int(span + 1);
        return {kind: 'raise', to};
    }
    if (roll < 0.22) return {kind: 'fold'};
    if (!legal.check && roll < 0.4) return {kind: 'fold'};
    return legal.check ? {kind: 'check'} : {kind: 'call'};
};

// ── references, written apart from the engine ──

type Contrib = {seat: number; amount: number; folded: boolean};

// Chip by chip: the nth chip of every seat that put in at least n is one slice, open to the live
// seats among them; a slice joins the pot before it when the same seats can win it, or when no
// live seat can. (Who still pays is kept as the chips go up, so a pot of 50,000 is 50,000 cheap
// steps.)
const naivePots = (contribs: readonly Contrib[]): {amount: number; eligible: number[]}[] => {
    const pots: {amount: number; eligible: number[]; mask: number}[] = [];
    const byAmount = [...contribs].sort((a, b) => a.amount - b.amount);
    const top = byAmount.length > 0 ? byAmount[byAmount.length - 1].amount : 0;
    let paid = byAmount.length;
    let mask = 0;
    for (const c of byAmount) if (!c.folded) mask |= 1 << c.seat;
    let gone = 0;
    for (let chip = 1; chip <= top; chip++) {
        for (; gone < byAmount.length && byAmount[gone].amount < chip; gone++) {
            paid--;
            mask &= ~(1 << byAmount[gone].seat);
        }
        const last = pots[pots.length - 1];
        if (last && (mask === 0 || mask === last.mask)) last.amount += paid;
        else pots.push({amount: paid, mask, eligible: contribs.filter((c) => (mask >> c.seat) & 1).map((c) => c.seat)});
    }
    return pots.map(({amount, eligible}) => ({amount, eligible}));
};

// The top contribution's lead over the next, when it stands alone.
const naiveUncalled = (contribs: readonly Contrib[]): {seat: number; amount: number} | null => {
    const sorted = [...contribs].sort((a, b) => b.amount - a.amount);
    const lead = sorted[0].amount - (sorted[1]?.amount ?? 0);
    return lead > 0 ? {seat: sorted[0].seat, amount: lead} : null;
};

const naiveShares = (amount: number, winners: number): number[] =>
    Array.from({length: winners}, (_, i) => Math.floor(amount / winners) + (i < amount % winners ? 1 : 0));

type Row = {stack: number; streetBet: number; actedAtBet: number | null; folded: boolean};

// The betting round rebuilt from the hand's log alone: stacks from the start stacks and every chip
// paid, the street's bets, who acted at which bet, the current bet and the last full raise. Each
// line's logged street bet is checked on the way.
const rebuildFromLog = (s: TableState) => {
    const hand = s.hand!;
    const street = STREETS.indexOf(hand.street);
    const rows = new Map<number, Row>(hand.seats.map((p) => [p.seat, {stack: p.startStack, streetBet: 0, actedAtBet: null, folded: false}]));
    let tracking = 0;
    let currentBet = hand.bigBlind;
    let increment = hand.bigBlind;
    const nextStreet = () => {
        tracking++;
        currentBet = 0;
        increment = hand.bigBlind;
        for (const row of rows.values()) {
            row.streetBet = 0;
            row.actedAtBet = null;
        }
    };
    const problems: string[] = [];
    for (const [seat, kindIndex, amount, to, , entryStreet] of hand.log) {
        while (tracking < entryStreet) nextStreet();
        const row = rows.get(seat);
        if (!row) continue;
        const kind = ENTRY_KINDS[kindIndex];
        switch (kind) {
            case 'ante':
                row.stack -= amount;
                break;
            case 'small-blind': case 'big-blind': case 'post':
                row.stack -= amount;
                row.streetBet += amount;
                break;
            case 'fold':
                row.folded = true;
                row.actedAtBet = currentBet;
                break;
            case 'check':
                row.actedAtBet = currentBet;
                break;
            case 'call':
                row.stack -= amount;
                row.streetBet += amount;
                row.actedAtBet = currentBet;
                break;
            case 'bet': case 'raise': {
                row.stack -= amount;
                row.streetBet += amount;
                if (row.streetBet - currentBet >= increment) increment = row.streetBet - currentBet;
                currentBet = row.streetBet;
                row.actedAtBet = currentBet;
                break;
            }
            case 'refund':
                row.stack += amount;
                break;
        }
        if (row.streetBet !== to) problems.push(`seat ${seat} ${kind}: logged to ${to}, rebuilt ${row.streetBet}`);
    }
    while (tracking < street) nextStreet();
    return {rows, currentBet, increment, problems};
};

// The moves the rules open to the actor over a rebuilt round (the spec's betting rules, written out).
const referenceLegal = (rows: Map<number, Row>, actor: number, currentBet: number, increment: number): Legal => {
    const me = rows.get(actor)!;
    const others = [...rows].filter(([seat]) => seat !== actor).map(([, row]) => row);
    const othersCanAct = others.some((q) => !q.folded && q.stack > 0);
    const target = othersCanAct ? currentBet : Math.min(currentBet, Math.max(0, ...others.filter((q) => !q.folded).map((q) => q.streetBet)));
    const due = Math.max(0, target - me.streetBet);
    const reopened = me.actedAtBet === null
        || (me.actedAtBet === 0 && currentBet > 0 && currentBet < increment)
        || currentBet - me.actedAtBet >= increment;
    const allInTo = me.streetBet + me.stack;
    const raise = me.stack > due && reopened && othersCanAct
        ? {kind: currentBet === 0 ? 'bet' as const : 'raise' as const, min: Math.min(currentBet + increment, allInTo), max: allInTo}
        : null;
    return {fold: true, check: due === 0, call: Math.min(due, me.stack), callAllIn: due > 0 && me.stack <= due, raise};
};

// ── one night ──

type Logged = {kind: 'action'; action: TableAction} | {kind: 'clock'; now: number} | {kind: 'force'; at: number};
type Dealt = {no: number; bb: number; n: number; who: Map<number, string>};

const COUNTERS = ['hands', 'showdowns', 'sidePots', 'oddChips', 'runouts', 'timeouts', 'autoMoves', 'leftMidHand', 'removedMidHand',
    'pendingBuys', 'approved', 'configs', 'pres', 'shows', 'pauses', 'bigBlindChecks', 'legalChecks'] as const;
type Counters = Record<(typeof COUNTERS)[number], number>;

const EVENTS = ['sit', 'leave', 'kick', 'sit-out', 'sit-in', 'buy', 'approve', 'pause', 'resume', 'config', 'pre', 'show'] as const;
// Half the steps are events, so each is about 4% of all steps (sit 6%, resume 7%, pause under 1%):
// a pause rarer than a resume and a sit likelier than a leave, so the tables keep dealing.
const EVENT_WEIGHTS: Record<(typeof EVENTS)[number], number> = {
    sit: 7, leave: 3, kick: 3, 'sit-out': 4, 'sit-in': 6, buy: 6, approve: 5, pause: 1, resume: 8, config: 5, pre: 6, show: 6,
};
const WEIGHT_TOTAL = EVENTS.reduce((sum, e) => sum + EVENT_WEIGHTS[e], 0);
// The share of steps that play the hand on (a move, or the clock when nobody is on it); the rest
// are events.
const PLAY = 0.5;

const night = (seed: number, counters: Counters) => {
    const r = randomOf(seed);
    const config = randomConfig(r);
    const source = deckSource(seed);
    const pool = Array.from({length: config.seats + 12}, (_, i) => pidOf(i));
    const records: Logged[] = [];
    const dealt: Dealt[] = [];
    let s = createTable({hostPid: 'p0', config, at: T0});
    let now = T0;
    let step = 0;
    let completed = 0;

    const fail = (what: string): never => {
        throw new Error(`seed ${seed}, step ${step}: ${what}`);
    };

    // Every number a safe integer, non-negative but a hand's net; nothing undefined, NaN or exotic.
    const walk = (value: unknown, key: string): void => {
        if (value === null || typeof value === 'boolean' || typeof value === 'string') return;
        if (typeof value === 'number') {
            if (!Number.isSafeInteger(value) || (value < 0 && key !== 'net')) fail(`${key} = ${value}`);
            return;
        }
        if (Array.isArray(value)) {
            for (const item of value) walk(item, key);
            return;
        }
        if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) fail(`${key} holds ${String(value)}`);
        for (const [k, v] of Object.entries(value as object)) if (k !== 'log') walk(v, k);
    };

    const checkState = (st: TableState) => {
        const c = conservation(st);
        if (!c.ok) fail(`conservation ${JSON.stringify(c)}`);
        walk(st, 'state');
        const seated = st.seats.filter((seat) => seat !== null).map((seat) => seat!.pid);
        if (new Set(seated).size !== seated.length) fail('a player sits twice');
        const rows = st.ledger.map((row) => row.pid);
        if (new Set(rows).size !== rows.length) fail('two ledger rows for one player');
        for (const pid of seated) if (!rows.includes(pid)) fail(`${pid} sits with no ledger row`);
        const asking = st.requests.map((q) => q.pid);
        if (new Set(asking).size !== asking.length) fail('two requests from one player');
        for (const pid of asking) {
            const seat = st.seats.find((x) => x?.pid === pid);
            if (!seat || seat.leaving) fail(`a request from ${pid}, who is not seated`);
        }
        if (st.status === 'closed' && (seated.length > 0 || st.requests.length > 0)) fail('a closed table with players');
        // The table never stalls: playing, two eligible seats and no live hand means a deal is timed.
        if (st.status === 'playing' && !st.closing && !isLive(st.hand) && eligibleSeats(st).length >= 2 && st.nextHandAt === null) fail('no deal timed');
        const hand = st.hand;
        for (const seat of st.seats) {
            if (seat && seat.pendingBuy > 0 && !liveSeatOf(st, seat.pid)) fail(`${seat.pid} has a pending buy outside a live hand`);
        }
        if (!hand) return;

        // The log, the cards and the positions.
        for (const e of hand.log) {
            const [seat, kind, amount, to, flags, street] = e;
            if (e.length !== 7 || !e.every(Number.isSafeInteger)) fail(`log entry ${JSON.stringify(e)}`);
            if (kind < 0 || kind >= ENTRY_KINDS.length || street < 0 || street > 3 || flags < 0 || flags > 7 || amount < 0 || to < 0) fail(`log entry ${JSON.stringify(e)}`);
            if (seat === -1 ? ENTRY_KINDS[kind] !== 'void' : !hand.seats.some((p) => p.seat === seat)) fail(`log entry for seat ${seat}`);
        }
        const cards = [...hand.deck, ...hand.seats.flatMap((p) => p.hole)];
        if (hand.deck.length !== 5 || cards.some((card) => !Number.isInteger(card) || card < 0 || card > 51) || new Set(cards).size !== cards.length) fail('cards dealt twice or out of the deck');
        const boardSize = [0, 3, 4, 5][STREETS.indexOf(hand.street)];
        if (hand.board.length !== boardSize || hand.board.some((card, i) => card !== hand.deck[i])) fail(`board ${hand.board} on the ${hand.street}`);
        const order = hand.seats.map((p) => p.seat);
        const size = st.seats.length;
        const away = order.map((seat) => (seat - hand.button - 1 + size) % size);
        if (order[order.length - 1] !== hand.button || away.some((d, i) => i > 0 && d <= away[i - 1])) fail(`hand order ${order} with the button at ${hand.button}`);
        if (new Set(hand.seats.map((p) => p.pid)).size !== order.length) fail('a player dealt in twice');
        if (order.length === 2) {
            if (hand.smallBlindSeat !== hand.button || hand.bigBlindSeat !== order[0]) fail('heads-up, the button is not the small blind');
        } else if (order[0] !== hand.smallBlindSeat || order[1] !== hand.bigBlindSeat) fail('the blinds are not the two seats after the button');
        for (const p of hand.seats) if (p.streetBet > p.committed) fail('a street bet above what was committed');

        if (hand.phase === 'complete') {
            if (!hand.result || hand.actor !== null) fail('a complete hand without its result');
            return;
        }
        for (const p of hand.seats) {
            if (st.seats[p.seat]?.pid !== p.pid) fail('a dealt seat changed hands mid-hand');
            if ((p.folded || p.allIn) && p.pre !== null) fail('a pre-action on a folded or all-in seat');
            // While betting a seat is all in exactly when nothing is behind; in a run-out the uncalled
            // bet may have come back to it.
            if (hand.phase === 'betting' && p.allIn !== (st.seats[p.seat]!.stack === 0)) fail(`seat ${p.seat}: all in ${p.allIn} with ${st.seats[p.seat]!.stack} behind`);
        }
        const live = hand.seats.filter((p) => !p.folded);
        if (hand.phase === 'runout') {
            if (hand.actor !== null || hand.nextStreetAt === null || live.length < 2) fail('a run-out with someone to act');
            if (live.filter((p) => !p.allIn).length > 1 || live.some((p) => !p.shown || p.streetBet > 0)) fail('a run-out two players could still bet in');
            return;
        }
        // Betting: the actor is live, holds chips, has to act, and is offered what the log allows.
        const actor = hand.actor;
        if (actor === null || hand.deadline === null) fail('betting with nobody on the clock');
        const p = hand.seats.find((q) => q.seat === actor);
        if (!p || p.folded || p.allIn || p.pre !== null || !needsToAct(hand, actor!)) fail(`seat ${actor} is on the clock with nothing to do`);
        if (hand.currentBet < Math.max(...hand.seats.map((q) => q.streetBet))) fail('a street bet above the current bet');
        const legal = legalFor(snapshotFromState(st), actor!);
        if (!legal) fail('the actor has no moves');
        if (hand.logDropped > 0) return;
        const rebuilt = rebuildFromLog(st);
        if (rebuilt.problems.length > 0) fail(rebuilt.problems.join('; '));
        if (rebuilt.currentBet !== hand.currentBet || rebuilt.increment !== hand.increment) {
            fail(`bet ${hand.currentBet}/${hand.increment}, the log says ${rebuilt.currentBet}/${rebuilt.increment}`);
        }
        for (const q of hand.seats) {
            const row = rebuilt.rows.get(q.seat)!;
            const stack = st.seats[q.seat]!.stack;
            if (row.stack !== stack || row.streetBet !== q.streetBet || row.folded !== q.folded || (!q.folded && row.actedAtBet !== q.actedAtBet)) {
                fail(`seat ${q.seat}: ${JSON.stringify({stack, streetBet: q.streetBet, actedAtBet: q.actedAtBet, folded: q.folded})}, the log says ${JSON.stringify(row)}`);
            }
        }
        const expected = referenceLegal(rebuilt.rows, actor!, rebuilt.currentBet, rebuilt.increment);
        if (JSON.stringify(expected) !== JSON.stringify(legal)) fail(`legal ${JSON.stringify(legal)}, the log allows ${JSON.stringify(expected)}`);
        counters.legalChecks++;
    };

    // A hand that has just completed: the uncalled bet, the pots, their winners and shares, the nets.
    const checkCompletion = (st: TableState) => {
        const hand = st.hand!;
        const result = hand.result!;
        counters.hands++;
        const contribs = hand.seats.map((p) => ({seat: p.seat, amount: p.committed, folded: p.folded}));
        const live = hand.seats.filter((p) => !p.folded);
        const total = contribs.reduce((sum, c) => sum + c.amount, 0);
        const before = contribs.map((c) => (result.refund?.seat === c.seat ? {...c, amount: c.amount + result.refund.amount} : c));
        if (JSON.stringify(naiveUncalled(before)) !== JSON.stringify(result.refund)) fail(`refund ${JSON.stringify(result.refund)}`);
        if (result.pots.reduce((sum, pot) => sum + pot.amount, 0) !== total) fail(`pots ${JSON.stringify(result.pots)} hold other than the ${total} in`);
        for (const pot of result.pots) {
            if (pot.winners.length === 0 || pot.winners.length !== pot.shares.length || pot.shares.reduce((a, b) => a + b, 0) !== pot.amount) fail(`pot ${JSON.stringify(pot)}`);
        }
        if (total > 0) {
            const top = Math.max(...contribs.map((c) => c.amount));
            if (!contribs.some((c) => c.amount === top && !c.folded)) fail('after the refund the top commitment is a folded seat\'s alone');
        }
        const won = new Map<number, number>();
        for (const pot of result.pots) pot.winners.forEach((seat, i) => won.set(seat, (won.get(seat) ?? 0) + pot.shares[i]));
        const nets = hand.seats.map((p) => ({seat: p.seat, net: (won.get(p.seat) ?? 0) - p.committed}));
        if (JSON.stringify(nets) !== JSON.stringify(result.nets)) fail(`nets ${JSON.stringify(result.nets)}`);
        for (const e of hand.log) {
            if (e[4] & ENTRY_FLAGS.timeout) counters.timeouts++;
            if (e[4] & ENTRY_FLAGS.auto) counters.autoMoves++;
        }
        if (!result.showdown) {
            const winner = live[0]?.seat;
            const expected = [{amount: total, eligible: [winner], winners: [winner], shares: [total]}];
            if (live.length !== 1 || JSON.stringify(result.pots) !== JSON.stringify(expected) || result.hands.length > 0) fail(`uncontested ${JSON.stringify(result)}`);
            return;
        }
        counters.showdowns++;
        if (hand.board.length !== 5 || live.length < 2) fail('a showdown short of a board or a second player');
        const reference = naivePots(contribs);
        if (JSON.stringify(reference) !== JSON.stringify(result.pots.map(({amount, eligible}) => ({amount, eligible})))) {
            fail(`pots ${JSON.stringify(result.pots)}, chip by chip ${JSON.stringify(reference)}`);
        }
        if (result.pots.length > 1) counters.sidePots++;
        const value = new Map(live.map((p) => [p.seat, evaluateCards([...hand.board, ...p.hole])]));
        for (const pot of result.pots) {
            if (pot.eligible.length === 0) fail('a pot nobody can win');
            const top = Math.max(...pot.eligible.map((seat) => value.get(seat)!));
            const winners = pot.eligible.filter((seat) => value.get(seat) === top);
            if (JSON.stringify(winners) !== JSON.stringify(pot.winners)) fail(`pot won by ${pot.winners}, the strongest are ${winners}`);
            if (JSON.stringify(naiveShares(pot.amount, winners.length)) !== JSON.stringify(pot.shares)) fail(`shares ${pot.shares} of ${pot.amount}`);
            if (new Set(pot.shares).size > 1) counters.oddChips++;
        }
        if (JSON.stringify(result.hands.map((h) => h.seat).sort()) !== JSON.stringify(live.map((p) => p.seat).sort())) fail('not every live hand shown');
        for (const shown of result.hands) {
            const p = hand.seats.find((q) => q.seat === shown.seat)!;
            const all = [...hand.board, ...p.hole];
            if (shown.value !== value.get(shown.seat) || shown.best.length !== 5 || new Set(shown.best).size !== 5
                || shown.best.some((card) => !all.includes(card)) || evaluateCards(shown.best) !== shown.value) fail(`shown hand ${JSON.stringify(shown)}`);
        }
    };

    // A new hand: the big blind moved one dealt seat on from the last hand's, so it never lands on the
    // same player twice running.
    const checkDeal = (prev: TableState, st: TableState, steps: number) => {
        const hand = st.hand!;
        const record: Dealt = {no: hand.no, bb: hand.bigBlindSeat, n: hand.seats.length, who: new Map(hand.seats.map((p) => [p.seat, p.pid]))};
        if (steps === 1 && JSON.stringify(hand.seats.map((p) => p.seat).sort((a, b) => a - b)) !== JSON.stringify(eligibleSeats(prev))) {
            fail('the deal left out an eligible seat or dealt in another');
        }
        const last = dealt[dealt.length - 1];
        if (last && last.no === record.no - 1) {
            const size = st.seats.length;
            const expected = [...record.who.keys()].sort((a, b) => ((a - last.bb - 1 + size) % size) - ((b - last.bb - 1 + size) % size))[0];
            if (record.bb !== expected) fail(`big blind ${record.bb}, one on from ${last.bb} is ${expected}`);
            if (last.n >= 3 && record.n >= 3 && last.bb === record.bb && last.who.get(last.bb) === record.who.get(record.bb)) fail('the same big blind twice running');
            counters.bigBlindChecks++;
        }
        dealt.push(record);
    };

    // Between two big blinds of a player dealt in every hand from one to the other, every other
    // player dealt in throughout pays it at most once.
    const checkOrbits = () => {
        for (let a = 0; a < dealt.length; a++) {
            const x = dealt[a].bb;
            const xPid = dealt[a].who.get(x);
            let b = a + 1;
            while (b < dealt.length && dealt[b].who.get(x) === xPid && dealt[b].bb !== x) b++;
            if (b >= dealt.length || dealt[b].who.get(x) !== xPid) continue;
            const between = dealt.slice(a, b + 1);
            if (between.some((d, i) => d.no !== dealt[a].no + i)) fail('a deal missing from the record');
            for (const [y, yPid] of dealt[a].who) {
                if (y === x || !between.every((d) => d.who.get(y) === yPid)) continue;
                const paid = between.slice(1, -1).filter((d) => d.bb === y).length;
                if (paid > 1) fail(`seat ${y} paid ${paid} big blinds between two of seat ${x}'s`);
            }
        }
    };

    // Every step's checks; at a completed hand the state goes through JSON and back into the stored
    // shape, and the night carries on from the copy.
    const after = (prev: TableState, next: TableState, steps = 1): TableState => {
        checkState(next);
        if (next.handNo - prev.handNo > 1) fail('two hands dealt in one step');
        if (next.handNo !== prev.handNo) checkDeal(prev, next, steps);
        const hand = next.hand;
        if (hand?.phase === 'runout' && prev.hand?.phase !== 'runout') counters.runouts++;
        const justCompleted = hand?.phase === 'complete' && (prev.hand?.no !== hand.no || prev.hand.phase !== 'complete');
        if (justCompleted) {
            completed++;
            checkCompletion(next);
        }
        if (justCompleted || step % 20 === 0) {
            const copy = JSON.parse(JSON.stringify(next)) as TableState;
            if (JSON.stringify(copy) !== JSON.stringify(next)) fail('the state changes through JSON');
            if (migrateState(copy) !== copy) fail('the stored shape refuses the state');
            if (justCompleted) return copy;
        }
        return next;
    };

    // The room runs the clock up to now before every request.
    const clockTo = (to: number) => {
        now = Math.max(now, to);
        const due = nextDue(s);
        if (!due || due.at > now) return;
        const prev = deepFreeze(s);
        const out = advance(prev, now, source);
        records.push({kind: 'clock', now});
        // Each due event happens at now, so every new deadline lies ahead: one event per call.
        if (out.steps !== 1) fail(`the clock took ${out.steps} steps`);
        s = after(prev, out.state, out.steps);
    };

    // A refused action and a no-op change nothing, so the replay needs only the actions that moved
    // the state.
    const send = (action: TableAction): string | null => {
        const prev = deepFreeze(s);
        const out = reduce(prev, deepFreeze(action));
        if (!out.ok) return out.reason;
        if (out.state === prev) return null;
        records.push({kind: 'action', action});
        s = after(prev, out.state);
        return null;
    };

    const seatedPids = () => s.seats.flatMap((seat) => (seat ? [seat.pid] : []));
    const freeSeats = () => s.seats.flatMap((seat, i) => (seat ? [] : [i]));
    const randomBuyIn = () => {
        const {buyInMin, buyInMax} = s.config;
        if (r.chance(0.05)) return buyInMax + 1;
        if (r.chance(0.05)) return buyInMin - 1;
        return buyInMin + r.int(buyInMax - buyInMin + 1);
    };

    // One event, aimed at someone it can apply to; about one in eight goes where it is refused (a
    // stranger, the wrong moment), since a refusal must leave the frozen state untouched too. With no
    // one it applies to, it is sent anyway now and then and otherwise skipped.
    const event = () => {
        let roll = r.int(WEIGHT_TOTAL);
        const kind = EVENTS.find((e) => (roll -= EVENT_WEIGHTS[e]) < 0)!;
        const astray = r.chance(0.12);
        const seated = seatedPids();
        const someone = seated.length > 0 && !astray ? r.pick(seated) : r.pick(pool);
        const among = (pids: readonly string[]): string | null => (pids.length > 0 && !astray ? r.pick(pids) : r.chance(0.2) ? someone : null);
        const hand = s.hand;
        const live = isLive(hand);
        switch (kind) {
            case 'sit': {
                // Mostly someone new: a player who has sat here before may sit again only as a rebuy.
                const away = pool.filter((pid) => !seated.includes(pid));
                const fresh = away.filter((pid) => !s.ledger.some((row) => row.pid === pid));
                const by = among(fresh.length > 0 && r.chance(0.9) ? fresh : away);
                const free = freeSeats();
                if (by) send({type: 'sit', by, seat: free.length > 0 && !astray ? r.pick(free) : r.int(s.seats.length), buyIn: randomBuyIn(), at: now});
                return;
            }
            case 'leave': {
                const by = among(seated);
                const dealtIn = by !== null && live && liveSeatOf(s, by) !== null;
                if (by && send({type: 'leave', by, at: now}) === null && dealtIn) counters.leftMidHand++;
                return;
            }
            case 'kick': {
                const target = among(seated.filter((pid) => pid !== 'p0'));
                if (!target) return;
                const dealtIn = live && liveSeatOf(s, target) !== null;
                if (send({type: 'host', by: 'p0', op: {op: 'kick', pid: target}, at: now}) === null && dealtIn) counters.removedMidHand++;
                return;
            }
            case 'sit-out': {
                const by = among(seated);
                if (by) send({type: 'sit-out', by, at: now});
                return;
            }
            case 'sit-in': {
                const by = among(s.seats.flatMap((seat) => (seat && (seat.sittingOut || seat.sitOutNext || seat.away) ? [seat.pid] : [])));
                if (by) send({type: 'sit-in', by, at: now});
                return;
            }
            case 'buy': {
                const by = among(seated.filter((pid) => buyRange(s, pid) !== null));
                if (!by) return;
                const range = buyRange(s, by);
                const amount = !range || astray ? 1 + r.int(s.config.buyInMax) : r.chance(0.5) ? range.max : range.min + r.int(range.max - range.min + 1);
                const dealtIn = live && liveSeatOf(s, by) !== null;
                const asked = s.requests.length;
                if (send({type: 'buy', by, amount, at: now}) === null && dealtIn && s.requests.length === asked) counters.pendingBuys++;
                return;
            }
            case 'approve': {
                const by = among(s.requests.map((q) => q.pid));
                const op = r.chance(0.8) ? 'approve' as const : 'deny' as const;
                if (by && send({type: 'host', by: 'p0', op: {op, pid: by}, at: now}) === null && op === 'approve') counters.approved++;
                return;
            }
            case 'pause': case 'resume': {
                if (s.status !== (kind === 'pause' ? 'playing' : 'paused') && !r.chance(0.1)) return;
                const by = astray ? r.pick(pool) : 'p0';
                if (send({type: 'host', by, op: {op: kind}, at: now}) === null && kind === 'pause') counters.pauses++;
                return;
            }
            case 'config': {
                const prev = s;
                if (send({type: 'host', by: 'p0', op: {op: 'config', patch: randomPatch(s.config, r)}, at: now}) === null && s !== prev) counters.configs++;
                return;
            }
            case 'pre': {
                const by = among(live && hand.phase === 'betting' ? hand.seats.filter((p) => !p.folded && !p.allIn && p.seat !== hand.actor).map((p) => p.pid) : []);
                if (!by) return;
                const i = s.seats.findIndex((seat) => seat?.pid === by);
                const due = live && i >= 0 ? Math.min(owed(hand, i), s.seats[i]!.stack) : 0;
                const options: PreAction[] = [{kind: 'check-fold'}, {kind: 'check'}, {kind: 'call-any'}, {kind: 'call', amount: astray ? 1 + r.int(50) : due}];
                const prev = s;
                if (send({type: 'pre', by, pre: r.chance(0.1) ? null : r.pick(options), at: now}) === null && s !== prev) counters.pres++;
                return;
            }
            case 'show': {
                const by = among(hand?.phase === 'complete' ? hand.seats.filter((p) => !p.shown).map((p) => p.pid) : []);
                const prev = s;
                if (by && send({type: 'show', by, at: now}) === null && s !== prev) counters.shows++;
                return;
            }
        }
    };

    // Seat two or more and deal.
    for (const pid of pool.slice(0, 2 + r.int(config.seats - 1))) {
        send({type: 'sit', by: pid, seat: r.pick(freeSeats()), buyIn: config.buyInMin + r.int(config.buyInMax - config.buyInMin + 1), at: now});
    }
    send({type: 'host', by: 'p0', op: {op: 'start'}, at: now});

    for (step = 0; step < MAX_STEPS && completed < HANDS; step++) {
        now += r.int(1500);
        clockTo(now);
        const hand = s.hand;
        const onClock = isLive(hand) && hand.phase === 'betting' ? hand.actor : null;
        const roll = r.next();
        if (onClock !== null && roll < 0.03) {
            clockTo(nextDue(s)!.at + r.int(300));
        } else if (roll < PLAY && onClock !== null) {
            const legal = legalFor(snapshotFromState(s), onClock);
            if (!legal) fail('the actor has no moves');
            const move = randomMove(legal!, r);
            const refused = send({type: 'act', by: s.seats[onClock]!.pid, turn: s.turn, move, at: now});
            if (refused) fail(`a legal move ${JSON.stringify(move)} was refused: ${refused}`);
        } else if (roll < PLAY && nextDue(s)) {
            clockTo(nextDue(s)!.at + r.int(300));
        } else {
            event();
        }
    }

    // The night ends: the host closes the table (after the live hand), or it is closed by force.
    if (r.chance(0.5)) {
        send({type: 'host', by: 'p0', op: {op: 'end'}, at: now});
        for (let guard = 0; s.status !== 'closed' && guard < 200; guard++) {
            const due = nextDue(s);
            if (!due) fail('a closing table with nothing due');
            clockTo(due!.at);
        }
    } else {
        const prev = deepFreeze(s);
        records.push({kind: 'force', at: now});
        s = forceClose(prev, now);
        checkState(s);
        if (isLive(prev.hand) && s.hand!.seats.some((p) => p.committed > 0)) fail('chips left in a called-off hand');
    }
    const end = conservation(s);
    if (s.status !== 'closed' || s.seats.some((seat) => seat !== null) || end.stacks + end.inPot > 0 || end.cashedOut !== end.bought || nextDue(s) !== null) {
        fail(`the night did not close cleanly: ${JSON.stringify(end)}`);
    }
    checkOrbits();
    return {config, records, final: s, completed};
};

// The recorded night again, from a fresh table and the same deck source.
const replay = (seed: number, config: GameConfig, records: readonly Logged[]): TableState => {
    const source = deckSource(seed);
    let s = createTable({hostPid: 'p0', config, at: T0});
    for (const record of records) {
        if (record.kind === 'clock') s = advance(s, record.now, source).state;
        else if (record.kind === 'force') s = forceClose(s, record.at);
        else {
            const out = reduce(s, record.action);
            if (out.ok) s = out.state;
        }
    }
    return s;
};

describe('seeded nights at random tables', () => {
    it(`keep every rule and invariant over ${SEEDS} nights of up to ${HANDS} hands, and replay exactly`, () => {
        const counters = Object.fromEntries(COUNTERS.map((key) => [key, 0])) as Counters;
        let short = 0;
        for (let seed = 1; seed <= SEEDS; seed++) {
            const {config, records, final, completed} = night(seed, counters);
            if (completed < HANDS) short++;
            expect(replay(seed, config, records), `seed ${seed} replays`).toEqual(final);
        }
        // The nights reached their hands and met every situation the checks are for.
        expect(short, 'nights that stopped short of their hands').toBeLessThanOrEqual(SEEDS / 10);
        expect(counters.hands).toBeGreaterThanOrEqual(SEEDS * HANDS * 0.9);
        for (const key of COUNTERS) expect(counters[key], key).toBeGreaterThan(0);
    }, Math.max(120_000, SEEDS * 1000));
});
