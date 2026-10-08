// Poker night's engine over seeded random nights. Each night is a random table — Texas hold'em, PLO
// (pot limit, on one to three boards) or Triple T (three cards each, one thrown away by everyone at
// once before the betting), 2 to 9 seats, with or without an ante, either rebuy policy — played with
// random legal moves and throws (now and then a card not held, or a throw for an earlier throw-away,
// refused), the throw-away's deadline throwing for whoever is still to, and between them players
// sitting down, leaving (now, or after the hand in play — and taking that back), being removed,
// sitting out and in, buying chips (once the first hand is dealt, a request the host approves,
// declines or the player withdraws), setting pre-actions, showing cards, asking to see a folded or
// uncontested hand and answering, turning asks off, and the host approving, pausing, resuming,
// changing the config (the game and PLO's boards too, from the next hand) and sitting players out; the lazy clock runs whatever falls due, dealing from a
// seeded deck source. A leave after the hand sent just as a deal falls due — the race every page's
// leave meets — is played out, never folded.
//
// After every step: the chips add up, every number is a whole, non-negative count, nobody sits twice
// and no card is dealt twice, the player on the clock is live, holds chips and has to act, and the
// moves they are offered are exactly the ones a replay of the street's log allows (in PLO, capped at the
// pot as the log adds it up; an all-in above the cap refused); a plan to leave
// after the hand only on a seat dealt into the live hand, never with a sit-out; requests only from
// seated players not leaving; asks only after a hand completes, from players who folded it, within
// their limits, never past a no's five hands (held to a record of every no and expiry kept apart
// from the state, so a cooldown the state lost is caught), the table's cooldowns and waiting asks
// within the cap and "no asks" naming only seated players and the hand's; buys the room marks as made
// with the host away landing at once; and the reducer never touched its frozen input. At every completed hand: the pots
// match a chip-by-chip reference, add up to what was left in after the uncalled bet came back, each
// splits evenly between the boards (the odd chips to the first), and each board's part goes to the
// strongest eligible hands on that board — in PLO by a brute force over every two hole cards with
// every three from the board — every seat leaving after it is empty, and the state
// survives a JSON round trip into the stored shape. In Triple T: every seat holds three cards until it
// throws one, two after, and at most one card thrown away a seat; the throw-away has nobody on the
// clock, one deadline and someone still to throw; the betting opens only once nobody is; a card the
// deadline throws counts no timeout and makes no one away; and no card is ever in two places among the
// runs, the holes and the cards thrown away. Across hands the
// big blind moves one eligible seat on, so nobody pays it twice running and nobody twice in one
// orbit of another player. A night replays to the same final state from its recorded actions.
//
// 100 nights of up to 60 hands by default; PN_SIM_SEEDS=1000 runs more, PN_SIM_COUNTERS=1 prints how often
// each situation came up.

import {describe, expect, it} from 'vitest';
import {evaluateCards} from '@/lib/poker/evaluator';
import {allInOpen, legalFor, needsToAct, owed, snapshotFromState} from '@/lib/poker-night/betting';
import {advance, nextDue} from '@/lib/poker-night/clock';
import {ASK_ANSWERS, ASKS, DEFAULT_CONFIG, ENTRY_FLAGS, ENTRY_KINDS, HOLE_CARDS, PLAYING_CARDS, STREETS, TABLE_LIMITS} from '@/lib/poker-night/config';
import {FULL_DECK, shuffleWith, type DeckSource} from '@/lib/poker-night/deck';
import {createTable, forceClose, reduce} from '@/lib/poker-night/engine';
import {buyRange, conservation, ledgerRow} from '@/lib/poker-night/ledger';
import {migrateState} from '@/lib/poker-night/migrate';
import {eligibleSeats, isLive, liveSeatOf} from '@/lib/poker-night/seats';
import {paidParts} from '@/lib/poker-night/pots';
import type {Card, GameConfig, HostOp, Legal, Move, PreAction, TableAction, TableState, Variant} from '@/lib/poker-night/types';
import {readShown} from '@/lib/poker-night/variants';
import {mulberry32} from '@/lib/random';
import {deepFreeze, pidOf, T0} from './fixtures';

const DEFAULT_SEEDS = 100;
const SEEDS = Math.max(DEFAULT_SEEDS, Number(process.env.PN_SIM_SEEDS) || 0);
const HANDS = 60;
const MAX_STEPS = HANDS * 180;

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
        rebuys: r.pick(['approve', 'approve', 'approve', 'off'] as const),
        maxRebuys: r.chance(0.3) ? 1 + r.int(3) : null,
        turnSeconds: TABLE_LIMITS.turnSeconds.min + r.int(TABLE_LIMITS.turnSeconds.max - TABLE_LIMITS.turnSeconds.min + 1),
        pauseSeconds: TABLE_LIMITS.pauseSeconds.min + r.int(TABLE_LIMITS.pauseSeconds.max - TABLE_LIMITS.pauseSeconds.min + 1),
        sitOutAfter: 1 + r.int(TABLE_LIMITS.sitOutAfter.max),
        ...(r.chance(0.3) ? {variant: 'plo' as const, boards: r.pick([1, 2, 3] as const)} : {variant: r.pick(['holdem', 'holdem', 'plo', 'triple-t', 'triple-t'] as const), boards: 1 as const}),
    };
};

// A config change the host might make; now and then one out of limits, which is refused.
const randomPatch = (c: GameConfig, r: Random): Extract<HostOp, {op: 'config'}>['patch'] => {
    switch (r.int(9)) {
        // The game, from the next hand — PLO on one to three boards, Triple T — and now and then a
        // second board for a game other than PLO, refused.
        case 8: return r.chance(0.1)
            ? r.pick([{variant: 'triple-t' as const, boards: 2 as const}, {variant: 'holdem' as const, boards: 2 as const}, {boards: 3 as const}])
            : r.chance(0.4) ? {variant: 'plo' as const, boards: r.pick([1, 2, 3] as const)} : {variant: r.pick(['holdem', 'plo', 'triple-t'] as const)};
        case 0: return {turnSeconds: r.chance(0.9) ? 15 + r.int(106) : 5};
        case 1: return {pauseSeconds: 3 + r.int(13)};
        case 2: return {sitOutAfter: 1 + r.int(5)};
        case 3: return {rebuys: r.pick(['off', 'approve', 'approve'] as const)};
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
// the most allowed), and the odd all-in — in PLO, where the stack is past the pot limit, a raise to
// the cap instead.
const randomMove = (legal: Legal, r: Random, allIn: boolean): Move => {
    const roll = r.next();
    if ((legal.raise || legal.callAllIn) && roll < 0.05) return allIn || !legal.raise ? {kind: 'all-in'} : {kind: 'raise', to: legal.raise.max};
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

// A hand's value on a board, written apart from the engine: the seven cards in Texas hold'em; in PLO
// the highest over every two of the four hole cards with every three of the board.
const naiveValue = (variant: Variant, hole: readonly Card[], board: readonly Card[]): number => {
    if (variant !== 'plo') return evaluateCards([...board, ...hole]);
    let top = -1;
    for (let a = 0; a < hole.length; a++) for (let b = a + 1; b < hole.length; b++)
        for (let c = 0; c < board.length; c++) for (let d = c + 1; d < board.length; d++) for (let e = d + 1; e < board.length; e++)
            top = Math.max(top, evaluateCards([hole[a], hole[b], board[c], board[d], board[e]]));
    return top;
};

const naiveShares = (amount: number, winners: number): number[] =>
    Array.from({length: winners}, (_, i) => Math.floor(amount / winners) + (i < amount % winners ? 1 : 0));

type Row = {stack: number; committed: number; streetBet: number; actedAtBet: number | null; folded: boolean};

// The betting round rebuilt from the hand's log alone: stacks from the start stacks and every chip
// paid, the street's bets, who acted at which bet, the current bet and the last full raise. Each
// line's logged street bet is checked on the way.
const rebuildFromLog = (s: TableState) => {
    const hand = s.hand!;
    const street = STREETS.indexOf(hand.street);
    const rows = new Map<number, Row>(hand.seats.map((p) => [p.seat, {stack: p.startStack, committed: 0, streetBet: 0, actedAtBet: null, folded: false}]));
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
                row.committed += amount;
                break;
            case 'small-blind': case 'big-blind': case 'post':
                row.stack -= amount;
                row.committed += amount;
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
                row.committed += amount;
                row.streetBet += amount;
                row.actedAtBet = currentBet;
                break;
            case 'bet': case 'raise': {
                row.stack -= amount;
                row.committed += amount;
                row.streetBet += amount;
                if (row.streetBet - currentBet >= increment) increment = row.streetBet - currentBet;
                currentBet = row.streetBet;
                row.actedAtBet = currentBet;
                break;
            }
            case 'refund':
                row.stack += amount;
                row.committed -= amount;
                break;
        }
        if (row.streetBet !== to) problems.push(`seat ${seat} ${kind}: logged to ${to}, rebuilt ${row.streetBet}`);
    }
    while (tracking < street) nextStreet();
    return {rows, currentBet, increment, problems};
};

// The moves the rules open to the actor over a rebuilt round (the spec's betting rules, written out):
// in PLO a bet or a raise at most to the current bet plus every chip the log put in plus the call.
const referenceLegal = (rows: Map<number, Row>, actor: number, currentBet: number, increment: number, potLimit: boolean): Legal => {
    const me = rows.get(actor)!;
    const others = [...rows].filter(([seat]) => seat !== actor).map(([, row]) => row);
    const othersCanAct = others.some((q) => !q.folded && q.stack > 0);
    const target = othersCanAct ? currentBet : Math.min(currentBet, Math.max(0, ...others.filter((q) => !q.folded).map((q) => q.streetBet)));
    const due = Math.max(0, target - me.streetBet);
    const reopened = me.actedAtBet === null
        || (me.actedAtBet === 0 && currentBet > 0 && currentBet < increment)
        || currentBet - me.actedAtBet >= increment;
    const allInTo = me.streetBet + me.stack;
    const min = Math.min(currentBet + increment, allInTo);
    const pot = [...rows.values()].reduce((sum, row) => sum + row.committed, 0);
    const max = potLimit ? Math.min(allInTo, Math.max(min, currentBet + pot + due)) : allInTo;
    const raise = me.stack > due && reopened && othersCanAct
        ? {kind: currentBet === 0 ? 'bet' as const : 'raise' as const, min, max}
        : null;
    return {fold: true, check: due === 0, call: Math.min(due, me.stack), callAllIn: due > 0 && me.stack <= due, raise};
};

// ── one night ──

type Logged = {kind: 'action'; action: TableAction} | {kind: 'clock'; now: number} | {kind: 'force'; at: number};
type Dealt = {no: number; bb: number; n: number; who: Map<number, string>};

const COUNTERS = ['hands', 'showdowns', 'sidePots', 'oddChips', 'runouts', 'timeouts', 'autoMoves', 'leftMidHand', 'removedMidHand',
    'pendingBuys', 'approved', 'configs', 'pres', 'shows', 'pauses', 'bigBlindChecks', 'legalChecks', 'hostSitOuts', 'hostSitOutsMidHand',
    'hostSitOutsAlreadyOut', 'leaveAfter', 'leaveAfterCancelled', 'leaveAfterCashOuts', 'leaveAfterRace', 'leaveAfterNow', 'buyRequests',
    'firstBuyIns', 'hostBuysAfterStart', 'withdrawn', 'declined', 'asks', 'asksShown', 'asksShownAll', 'asksNo', 'asksExpired', 'askCooldowns',
    'asksOff', 'askLimits', 'asksFull', 'asksDealt', 'hostAwayBuys', 'ploHands', 'ploShowdowns', 'potLimitCaps', 'potLimitAllInRefused',
    'multiBoardHands', 'multiBoardShowdowns', 'scoops', 'boardSplits', 'tripleTHands', 'tripleTShowdowns', 'discards', 'discardTimeouts',
    'discardsForLeavers', 'discardsRefused', 'tripleTWonInThrowAway'] as const;
type Counters = Record<(typeof COUNTERS)[number], number>;

const EVENTS = [
    'sit', 'leave', 'leave-after', 'kick', 'sit-out', 'host-sit-out', 'sit-in', 'buy', 'approve', 'withdraw', 'pause', 'resume', 'config', 'pre', 'show',
    'ask', 'ask-storm', 'reply', 'allow-asks',
] as const;
// Half the steps are events, so each is about 3% of all steps (sit 5%, approve 7%, pause under 1%):
// a pause rarer than a resume, a sit likelier than a leave and an approval likelier than a buy, so
// the tables keep dealing.
const EVENT_WEIGHTS: Record<(typeof EVENTS)[number], number> = {
    sit: 7, leave: 2, 'leave-after': 3, kick: 2, 'sit-out': 4, 'host-sit-out': 2, 'sit-in': 6, buy: 6, approve: 10, withdraw: 1, pause: 1, resume: 8,
    config: 5, pre: 6, show: 4, ask: 8, 'ask-storm': 1, reply: 8, 'allow-asks': 1,
};
const WAITING = ASK_ANSWERS.indexOf('waiting');
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

    // Every no and every ask that ran out, by who asked whom, with the last hand it holds for: kept
    // apart from the state, so a cooldown the state lost still keeps the ask it should have refused.
    const noes = new Map<string, number>();
    const noted = (from: string, to: string, no: number) => noes.set(`${from}>${to}`, no + ASKS.COOLDOWN_HANDS);
    const heldBack = (from: string, to: string, no: number) => (noes.get(`${from}>${to}`) ?? -1) >= no;

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
        // A seat holding chips has a ledger row; one with none is a newcomer whose first chips wait.
        for (const seat of st.seats) {
            if (seat && !rows.includes(seat.pid) && (seat.stack > 0 || seat.pendingBuy > 0)) fail(`${seat.pid} holds chips with no ledger row`);
        }
        const asking = st.requests.map((q) => q.pid);
        if (new Set(asking).size !== asking.length) fail('two requests from one player');
        for (const pid of asking) {
            const seat = st.seats.find((x) => x?.pid === pid);
            if (!seat || seat.leaving || seat.leaveAfter) fail(`a request from ${pid}, who is not seated or is leaving`);
            if (st.handNo === 0 || pid === st.hostPid) fail(`a request from ${pid} that needed nobody`);
        }
        for (const seat of st.seats) {
            if (!seat) continue;
            if (seat.leaveAfter && seat.sitOutNext) fail(`${seat.pid} both leaves after the hand and sits out from the next`);
            if (seat.leaveAfter && (seat.leaving || !liveSeatOf(st, seat.pid))) fail(`${seat.pid} leaves after a hand it is not playing`);
        }
        const waitingAsks = st.hand?.asks.filter((e) => e[3] === WAITING).length ?? 0;
        if (st.askCooldowns.length + waitingAsks > ASKS.COOLDOWNS_KEPT) fail('more cooldowns and waiting asks than the table keeps');
        for (const pid of st.noAsks) {
            if (!st.seats.some((x) => x?.pid === pid) && !(st.hand?.seats.some((p) => p.pid === pid) ?? false)) fail(`"no asks" kept for ${pid}, who is neither seated nor in the hand`);
        }
        for (const [from, to, until] of st.askCooldowns) if (from === to || until < st.handNo) fail(`a cooldown ${from} → ${to} past its hands`);
        if (st.status === 'closed' && (seated.length > 0 || st.requests.length > 0)) fail('a closed table with players');
        // The table never stalls: playing, two eligible seats and no live hand means a deal is timed.
        if (st.status === 'playing' && !st.closing && !isLive(st.hand) && eligibleSeats(st).length >= 2 && st.nextHandAt === null) fail('no deal timed');
        const hand = st.hand;
        for (const seat of st.seats) {
            if (seat && seat.pendingBuy > 0 && !liveSeatOf(st, seat.pid)) fail(`${seat.pid} has a pending buy outside a live hand`);
        }
        if (!hand) return;

        // The asks: only once the hand completed, from a player who folded it, to another dealt
        // player, at most PER_HAND each and one waiting at a time.
        if (hand.asks.length > 0 && hand.phase !== 'complete') fail('asks during a live hand');
        for (const [from, to, at, answer] of hand.asks) {
            const p = hand.seats.find((q) => q.seat === from);
            if (!p || !p.folded || from === to || !hand.seats.some((q) => q.seat === to) || at < 0 || answer < 0 || answer >= ASK_ANSWERS.length) fail(`ask ${[from, to, at, answer]}`);
        }
        for (const p of hand.seats) {
            const mine = hand.asks.filter((e) => e[0] === p.seat);
            if (mine.length > ASKS.PER_HAND || mine.filter((e) => e[3] === WAITING).length > 1) fail(`seat ${p.seat} asked past its limits`);
        }

        // The log, the cards and the positions.
        for (const e of hand.log) {
            const [seat, kind, amount, to, flags, street] = e;
            if (e.length !== 7 || !e.every(Number.isSafeInteger)) fail(`log entry ${JSON.stringify(e)}`);
            if (kind < 0 || kind >= ENTRY_KINDS.length || street < 0 || street > 3 || flags < 0 || flags > 7 || amount < 0 || to < 0) fail(`log entry ${JSON.stringify(e)}`);
            if (seat === -1 ? ENTRY_KINDS[kind] !== 'void' : !hand.seats.some((p) => p.seat === seat)) fail(`log entry for seat ${seat}`);
        }
        const cards = [...hand.deck.flat(), ...hand.seats.flatMap((p) => p.hole), ...hand.discards.map(([, card]) => card)];
        // Texas hold'em and Triple T on one board, PLO on one to three; five cards a run. Every seat holds
        // what its game deals, but in Triple T a seat that threw one away (at most one each) holds two.
        const runs = hand.variant === 'plo' ? [1, 2, 3] : [1];
        const thrown = new Map(hand.discards.map(([seat, card]) => [seat, card]));
        if (!['holdem', 'plo', 'triple-t'].includes(hand.variant) || !runs.includes(hand.deck.length) || hand.deck.some((run) => run.length !== 5)
            || hand.seats.some((p) => p.hole.length + (thrown.has(p.seat) ? 1 : 0) !== HOLE_CARDS[hand.variant])
            || thrown.size !== hand.discards.length || hand.discards.some(([seat]) => !hand.seats.some((p) => p.seat === seat))
            || (hand.variant !== 'triple-t' && hand.discards.length > 0)) {
            fail(`not a deal of ${hand.variant} on ${hand.deck.length} boards`);
        }
        // Past the throw-away, everyone still in holds the two they kept; a hand won in it (everyone
        // else gone) may end with its winner's three.
        if (hand.variant === 'triple-t' && hand.phase !== 'discard' && (hand.phase !== 'complete' || hand.result?.showdown)) {
            if (hand.seats.some((p) => !p.folded && p.hole.length !== PLAYING_CARDS['triple-t'])) fail('a player still in past the throw-away without two cards');
        }
        if (hand.phase === 'discard') {
            if (hand.variant !== 'triple-t' || hand.actor !== null || hand.deadline === null || hand.street !== 'preflop') fail('a throw-away with someone on the clock or no deadline');
            if (!hand.seats.some((p) => !p.folded && p.hole.length === 3)) fail('a throw-away with nobody still to throw');
            if (hand.seats.filter((p) => !p.folded).length < 2) fail('a throw-away with one player left');
            if (hand.seats.some((p) => p.pre !== null)) fail('a pre-action in the throw-away');
        }
        if (cards.some((card) => !Number.isInteger(card) || card < 0 || card > 51) || new Set(cards).size !== cards.length) fail('cards dealt twice or out of the deck');
        const boardSize = [0, 3, 4, 5][STREETS.indexOf(hand.street)];
        if (hand.boards.length !== hand.deck.length || hand.boards.some((b, k) => b.length !== boardSize || b.some((card, i) => card !== hand.deck[k][i]))) {
            fail(`boards ${JSON.stringify(hand.boards)} on the ${hand.street}`);
        }
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
        if (hand.phase === 'discard') return;
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
        const expected = referenceLegal(rebuilt.rows, actor!, rebuilt.currentBet, rebuilt.increment, hand.variant === 'plo');
        if (JSON.stringify(expected) !== JSON.stringify(legal)) fail(`legal ${JSON.stringify(legal)}, the log allows ${JSON.stringify(expected)}`);
        counters.legalChecks++;
    };

    // A hand that has just completed: the uncalled bet, the pots, their winners and shares, the nets.
    const checkCompletion = (st: TableState) => {
        const hand = st.hand!;
        const result = hand.result!;
        counters.hands++;
        if (hand.variant === 'plo') counters.ploHands++;
        if (hand.variant === 'triple-t') {
            counters.tripleTHands++;
            if (result.showdown) counters.tripleTShowdowns++;
            if (hand.discards.length < hand.seats.length && hand.seats.filter((p) => !p.folded).some((p) => p.hole.length === 3)) counters.tripleTWonInThrowAway++;
            for (const e of hand.log) {
                if (ENTRY_KINDS[e[1]] !== 'discard') continue;
                if (e[2] !== 0) fail('a throw-away line with chips');
                if (e[4] & ENTRY_FLAGS.timeout) counters.discardTimeouts++;
                else if (e[4] & ENTRY_FLAGS.auto) counters.discardsForLeavers++;
                else counters.discards++;
            }
        }
        if (hand.boards.length > 1) counters.multiBoardHands++;
        const contribs = hand.seats.map((p) => ({seat: p.seat, amount: p.committed, folded: p.folded}));
        const live = hand.seats.filter((p) => !p.folded);
        const total = contribs.reduce((sum, c) => sum + c.amount, 0);
        const before = contribs.map((c) => (result.refund?.seat === c.seat ? {...c, amount: c.amount + result.refund.amount} : c));
        if (JSON.stringify(naiveUncalled(before)) !== JSON.stringify(result.refund)) fail(`refund ${JSON.stringify(result.refund)}`);
        if (result.pots.reduce((sum, pot) => sum + pot.amount, 0) !== total) fail(`pots ${JSON.stringify(result.pots)} hold other than the ${total} in`);
        // A part a board at a showdown (one when paid uncontested), each with its winners and the shares
        // the client's own split works out; the parts' chips the pot's, the odd chips to the first boards.
        const parts = result.showdown ? hand.boards.length : 1;
        for (const pot of result.pots) {
            if (pot.winners.length !== parts || pot.shares.length !== parts || pot.winners.some((w, k) => w.length === 0 || w.length !== pot.shares[k].length)
                || pot.shares.flat().reduce((a, b) => a + b, 0) !== pot.amount) fail(`pot ${JSON.stringify(pot)}`);
            const each = pot.shares.map((s) => s.reduce((a, b) => a + b, 0));
            if (each.some((n, k) => n !== Math.floor(pot.amount / parts) + (k < pot.amount % parts ? 1 : 0))) fail(`pot ${JSON.stringify(pot)} split between the boards unevenly`);
            if (JSON.stringify(paidParts(pot).map((part) => part.shares)) !== JSON.stringify(pot.shares)) fail(`pot ${JSON.stringify(pot)} split otherwise than paidParts`);
        }
        if (total > 0) {
            const top = Math.max(...contribs.map((c) => c.amount));
            if (!contribs.some((c) => c.amount === top && !c.folded)) fail('after the refund the top commitment is a folded seat\'s alone');
        }
        const won = new Map<number, number>();
        for (const pot of result.pots) pot.winners.forEach((board, k) => board.forEach((seat, i) => won.set(seat, (won.get(seat) ?? 0) + pot.shares[k][i])));
        const nets = hand.seats.map((p) => ({seat: p.seat, net: (won.get(p.seat) ?? 0) - p.committed}));
        if (JSON.stringify(nets) !== JSON.stringify(result.nets)) fail(`nets ${JSON.stringify(result.nets)}`);
        for (const e of hand.log) {
            if (e[4] & ENTRY_FLAGS.timeout) counters.timeouts++;
            if (e[4] & ENTRY_FLAGS.auto) counters.autoMoves++;
        }
        if (!result.showdown) {
            const winner = live[0]?.seat;
            const expected = [{amount: total, eligible: [winner], winners: [[winner]], shares: [[total]]}];
            if (live.length !== 1 || JSON.stringify(result.pots) !== JSON.stringify(expected) || result.hands.length > 0) fail(`uncontested ${JSON.stringify(result)}`);
            return;
        }
        counters.showdowns++;
        if (hand.boards.some((b) => b.length !== 5) || live.length < 2) fail('a showdown short of a board or a second player');
        if (hand.variant === 'plo') counters.ploShowdowns++;
        if (hand.boards.length > 1) counters.multiBoardShowdowns++;
        const reference = naivePots(contribs);
        if (JSON.stringify(reference) !== JSON.stringify(result.pots.map(({amount, eligible}) => ({amount, eligible})))) {
            fail(`pots ${JSON.stringify(result.pots)}, chip by chip ${JSON.stringify(reference)}`);
        }
        if (result.pots.length > 1) counters.sidePots++;
        // Each board on its own: its part of each pot to the strongest eligible hands on that board.
        const values = hand.boards.map((board) => new Map(live.map((p) => [p.seat, naiveValue(hand.variant, p.hole, board)])));
        for (const pot of result.pots) {
            if (pot.eligible.length === 0) fail('a pot nobody can win');
            const amounts = naiveShares(pot.amount, hand.boards.length);
            hand.boards.forEach((_, k) => {
                const value = values[k];
                const top = Math.max(...pot.eligible.map((seat) => value.get(seat)!));
                const winners = pot.eligible.filter((seat) => value.get(seat) === top);
                if (JSON.stringify(winners) !== JSON.stringify(pot.winners[k])) fail(`pot won on board ${k} by ${pot.winners[k]}, the strongest are ${winners}`);
                if (JSON.stringify(naiveShares(amounts[k], winners.length)) !== JSON.stringify(pot.shares[k])) fail(`shares ${pot.shares[k]} of ${amounts[k]} on board ${k}`);
                if (new Set(pot.shares[k]).size > 1) counters.oddChips++;
            });
            if (hand.boards.length > 1) {
                if (new Set(pot.winners.map((w) => JSON.stringify(w))).size > 1) counters.boardSplits++;
                else if (pot.winners[0].length === 1) counters.scoops++;
            }
        }
        if (JSON.stringify(result.hands.map((h) => h.seat).sort()) !== JSON.stringify(live.map((p) => p.seat).sort())) fail('not every live hand shown');
        for (const shown of result.hands) {
            const p = hand.seats.find((q) => q.seat === shown.seat)!;
            const reads = readShown(hand.variant, hand.boards, shown).reads;
            if (JSON.stringify(shown.cards) !== JSON.stringify(p.hole) || reads.length !== hand.boards.length) fail(`shown hand ${JSON.stringify(shown)}`);
            hand.boards.forEach((board, k) => {
                const read = reads[k];
                const all = [...board, ...p.hole];
                if (read.value !== values[k].get(shown.seat) || read.best.length !== 5 || new Set(read.best).size !== 5
                    || read.best.some((card) => !all.includes(card)) || evaluateCards(read.best) !== read.value) fail(`shown hand ${JSON.stringify(shown)} on board ${k}`);
                // PLO: exactly two of the hole cards play.
                if (hand.variant === 'plo' && read.best.filter((card) => p.hole.includes(card)).length !== 2) fail(`PLO hand ${JSON.stringify(shown)} plays other than two hole cards`);
            });
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
        // A card the throw-away's deadline threw counts no timeout and makes nobody away.
        if (prev.hand && next.hand && prev.hand.no === next.hand.no && prev.hand.phase === 'discard') {
            for (const e of next.hand.log.slice(prev.hand.log.length)) {
                if (ENTRY_KINDS[e[1]] !== 'discard' || !(e[4] & ENTRY_FLAGS.timeout)) continue;
                const was = prev.seats[e[0]];
                const now = next.seats[e[0]];
                if (was && now && (now.timeouts !== was.timeouts || now.away !== was.away)) fail(`a card thrown away for seat ${e[0]} counted as a timeout`);
            }
        }
        if (next.handNo - prev.handNo > 1) fail('two hands dealt in one step');
        if (next.handNo !== prev.handNo) {
            checkDeal(prev, next, steps);
            // The last hand's asks end with it: one whose seconds were up by the deal is a no, with its
            // cooldown; one still waiting with time left just ends, with none.
            for (const [from, to, askedAt, answer] of prev.hand?.asks ?? []) {
                if (answer !== WAITING) continue;
                const a = prev.hand!.seats.find((p) => p.seat === from)!.pid;
                const b = prev.hand!.seats.find((p) => p.seat === to)!.pid;
                const cooled = next.askCooldowns.some(([x, y, until]) => x === a && y === b && until === prev.hand!.no + ASKS.COOLDOWN_HANDS);
                const before = prev.askCooldowns.some(([x, y]) => x === a && y === b);
                if (next.hand!.startedAt >= prev.hand!.startedAt + askedAt + ASKS.WAIT_MS) {
                    counters.asksExpired++;
                    noted(a, b, prev.hand!.no);
                    if (!cooled) fail(`an ask ${a} → ${b} ran out unanswered with no cooldown`);
                } else {
                    counters.asksDealt++;
                    if (cooled && !before) fail(`an ask ${a} → ${b} the deal cut short left a cooldown`);
                }
            }
        }
        if (next.handNo === prev.handNo && next.hand && prev.hand) {
            next.hand.asks.forEach(([from, to, , answer], k) => {
                if (prev.hand!.asks[k]?.[3] !== WAITING || (answer !== ASK_ANSWERS.indexOf('expired') && answer !== ASK_ANSWERS.indexOf('no'))) return;
                noted(next.hand!.seats.find((p) => p.seat === from)!.pid, next.hand!.seats.find((p) => p.seat === to)!.pid, next.hand!.no);
            });
        }
        const hand = next.hand;
        if (hand?.phase === 'runout' && prev.hand?.phase !== 'runout') counters.runouts++;
        const justCompleted = hand?.phase === 'complete' && (prev.hand?.no !== hand.no || prev.hand.phase !== 'complete');
        if (justCompleted) {
            completed++;
            checkCompletion(next);
            // Every seat that was to leave after this hand is empty now: cashed out once.
            for (const p of next.hand!.seats) {
                const was = prev.seats[p.seat];
                if (!was || was.pid !== p.pid || !was.leaveAfter) continue;
                if (next.seats.some((x) => x?.pid === p.pid)) fail(`${p.pid} leaves after the hand but still sits`);
                counters.leaveAfterCashOuts++;
            }
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
    const sendFull = (action: TableAction): ReturnType<typeof reduce> => {
        const prev = deepFreeze(s);
        const out = reduce(prev, deepFreeze(action));
        if (!out.ok || out.state === prev) return out;
        records.push({kind: 'action', action});
        s = after(prev, out.state);
        return out;
    };
    const send = (action: TableAction): string | null => {
        const out = sendFull(action);
        return out.ok ? null : out.reason;
    };
    const seatOfPid = (pid: string) => s.seats.find((x) => x?.pid === pid) ?? null;

    const seatedPids = () => s.seats.flatMap((seat) => (seat ? [seat.pid] : []));
    const freeSeats = () => s.seats.flatMap((seat, i) => (seat ? [] : [i]));
    const randomBuyIn = () => {
        const {buyInMin, buyInMax} = s.config;
        if (r.chance(0.05)) return buyInMax + 1;
        if (r.chance(0.05)) return buyInMin - 1;
        return buyInMin + r.int(buyInMax - buyInMin + 1);
    };

    // An ask by `from` of `to` in the pause, its refusal checked against the reason given: null when
    // it was taken (or changed nothing), else the refusal.
    const tryAsk = (from: string, to: string): string | null => {
        const hand = s.hand!;
        const before = hand.asks.length;
        const refused = send({type: 'ask', by: from, to, at: now});
        if (refused === null) {
            if (s.hand!.asks.length > before) {
                if (s.hand!.asks.at(-1)![3] !== WAITING) fail('a new ask is not waiting');
                if (heldBack(from, to, hand.no)) fail(`${from} asked ${to} within five hands of a no`);
                counters.asks++;
            }
        } else if (refused === 'ask-cooldown') {
            if (!s.askCooldowns.some(([a, b, until]) => a === from && b === to && until >= hand.no)
                && !hand.asks.some((e) => hand.seats.find((p) => p.seat === e[0])!.pid === from && hand.seats.find((p) => p.seat === e[1])!.pid === to)) fail('a cooldown refused with none kept');
            counters.askCooldowns++;
        } else if (refused === 'asks-off') {
            if (!s.noAsks.includes(to)) fail('asks off refused for a player who takes them');
            counters.asksOff++;
        } else if (refused === 'ask-limit') {
            counters.askLimits++;
        } else if (refused === 'asks-full') {
            const live = s.askCooldowns.filter(([, , until]) => until >= hand.no).length;
            if (live + s.hand!.asks.filter((e) => e[3] === WAITING).length < ASKS.COOLDOWNS_KEPT) fail('asks refused as full below the cap');
            counters.asksFull++;
        }
        return refused;
    };

    // The player asked says no: a cooldown on the one who asked, kept — never dropped for room.
    const answerNo = (e: readonly number[]) => {
        const hand = s.hand!;
        const by = hand.seats.find((p) => p.seat === e[1])!.pid;
        const to = hand.seats.find((p) => p.seat === e[0])!.pid;
        const out = sendFull({type: 'reply', by, to, show: 'none', at: now});
        if (!out.ok) {
            if (out.reason === 'no-request' && now >= hand.startedAt + e[2] + ASKS.WAIT_MS) counters.asksExpired++;
            return;
        }
        if (!s.askCooldowns.some(([a, b]) => a === to && b === by)) fail('a no left no cooldown');
        counters.asksNo++;
    };

    // A busy pause: every folded player asks everyone they may, and each ask is turned down at once —
    // over a few hands the cooldowns pile up to the table's cap, where asks stop until some run out.
    let stormUntil = -1;
    const stormed = new Set<number>();
    const storm = () => {
        const hand = s.hand!;
        stormed.add(hand.no);
        for (const from of hand.seats.filter((p) => p.folded).map((p) => p.pid)) {
            for (const to of hand.seats.map((p) => p.pid).filter((pid) => pid !== from)) {
                if (tryAsk(from, to) !== null) continue;
                const waiting = s.hand!.asks.find((e) => e[3] === WAITING && s.hand!.seats.find((p) => p.seat === e[0])!.pid === from);
                if (waiting) answerNo(waiting);
            }
        }
    };

    // One event, aimed at someone it can apply to; about one in eight goes where it is refused (a
    // stranger, the wrong moment), since a refusal must leave the frozen state untouched too. With no
    // one it applies to, it is sent anyway now and then and otherwise skipped.
    const event = () => {
        let roll = r.int(WEIGHT_TOTAL);
        const kind = EVENTS.find((e) => (roll -= EVENT_WEIGHTS[e]) < 0)!;
        if (s.hand?.phase === 'complete' && s.hand.result && s.handNo <= stormUntil && !stormed.has(s.handNo)) {
            storm();
            return;
        }
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
                if (!by) return;
                if (send({type: 'sit', by, seat: free.length > 0 && !astray ? r.pick(free) : r.int(s.seats.length), buyIn: randomBuyIn(), at: now}) !== null) return;
                // Once the first hand is dealt, anyone but the host sits with nothing until the host approves.
                if (s.handNo > 0 && by !== s.hostPid) {
                    if (seatOfPid(by)?.stack !== 0 || !s.requests.some((q) => q.pid === by)) fail(`${by} sat with chips nobody approved`);
                    counters.buyRequests++;
                }
                return;
            }
            case 'leave': {
                const by = among(seated);
                const dealtIn = by !== null && live && liveSeatOf(s, by) !== null;
                if (by && send({type: 'leave', by, at: now}) === null && dealtIn) counters.leftMidHand++;
                return;
            }
            case 'leave-after': {
                const by = among(seated);
                if (!by) return;
                // Mostly a leave; one already waiting for the hand is as often taken back.
                const on = seatOfPid(by)?.leaveAfter ? r.chance(0.5) : r.chance(0.9);
                const due = nextDue(s);
                if (on && !live && due?.kind === 'start' && r.chance(0.5)) {
                    // The race: the deal falls due as the leave is on its way, and the room runs its
                    // clock first. Dealt in, the player plays the hand out — no fold, and nothing lost.
                    clockTo(due.at);
                    const p = liveSeatOf(s, by);
                    if (p && !seatOfPid(by)!.leaving) {
                        const logged = s.hand!.log.length;
                        if (send({type: 'leave-after', by, on: true, at: now}) !== null) fail('a leave after the hand was refused');
                        if (!seatOfPid(by)?.leaveAfter) fail('a leave sent as a deal landed did not wait for the hand');
                        if (s.hand!.log.slice(logged).some((e) => e[0] === p.seat && ENTRY_KINDS[e[1]] === 'fold')) fail('a leave sent as a deal landed folded');
                        counters.leaveAfterRace++;
                        return;
                    }
                }
                const before = seatOfPid(by);
                const dealtIn = isLive(s.hand) && liveSeatOf(s, by) !== null;
                if (send({type: 'leave-after', by, on, at: now}) !== null) return;
                const seat = seatOfPid(by);
                if (on) {
                    if (dealtIn && before && !before.leaving) {
                        if (!seat?.leaveAfter) fail(`${by} asked to leave after the hand and does not`);
                        if (!before.leaveAfter) counters.leaveAfter++;
                    } else if (!dealtIn) {
                        if (seat) fail(`${by} left between hands and still sits`);
                        counters.leaveAfterNow++;
                    }
                } else if (before?.leaveAfter) {
                    if (seat?.leaveAfter) fail(`${by} stays after all and is still leaving`);
                    counters.leaveAfterCancelled++;
                }
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
            case 'host-sit-out': {
                // The host sits someone else out — now and then one already out or waiting to be, by
                // their own wish or an earlier one of the host's, which it must leave as it is: nothing
                // the host sends deals a player back in.
                const target = among(seated.filter((pid) => pid !== 'p0'));
                if (!target) return;
                const before = s.seats.find((seat) => seat?.pid === target) ?? null;
                const already = before !== null && (before.sitOutNext || before.sittingOut);
                const dealtIn = live && liveSeatOf(s, target) !== null;
                const prev = s;
                const refused = send({type: 'host', by: 'p0', op: {op: 'sit-out', pid: target}, at: now});
                if (refused !== null) return;
                const after = s.seats.find((seat) => seat?.pid === target) ?? null;
                if (!before || !after) fail('a host sit-out moved a seat');
                if (already) {
                    counters.hostSitOutsAlreadyOut++;
                    // Still out, or still waiting to be (a deal the clock ran meanwhile turns waiting into out).
                    if (!after!.sitOutNext && !after!.sittingOut) fail('a host sit-out dealt a player back in');
                }
                if (s === prev) return;
                counters.hostSitOuts++;
                if (dealtIn) {
                    counters.hostSitOutsMidHand++;
                    if (!after!.sitOutNext || after!.sittingOut !== before!.sittingOut) fail('a host sit-out mid-hand did more than wait for the deal');
                } else if (!after!.sittingOut) {
                    fail('a host sit-out between hands left the seat in');
                }
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
                const before = {bought: ledgerRow(s, by)?.bought ?? 0, pending: seatOfPid(by)?.pendingBuy ?? 0};
                // Now and then the host has been away long enough: the room marks the buy, and it lands.
                const hostAway = s.handNo > 0 && by !== s.hostPid && r.chance(0.08);
                if (send({type: 'buy', by, amount, at: now, ...(hostAway ? {hostAway} : {})}) !== null) return;
                if (hostAway) {
                    if (s.requests.some((q) => q.pid === by)) fail(`${by}'s buy with the host away left a request`);
                    if ((ledgerRow(s, by)?.bought ?? 0) === before.bought && (seatOfPid(by)?.pendingBuy ?? 0) === before.pending) fail(`${by}'s buy with the host away did not land`);
                    counters.hostAwayBuys++;
                } else if (s.handNo > 0 && by !== s.hostPid) {
                    // Once the first hand is dealt, every buy but the host's waits for the host.
                    if ((ledgerRow(s, by)?.bought ?? 0) !== before.bought || (seatOfPid(by)?.pendingBuy ?? 0) !== before.pending) fail(`${by}'s buy landed with nobody's yes`);
                    if (!s.requests.some((q) => q.pid === by && q.amount === amount)) fail(`${by}'s buy left no request`);
                    counters.buyRequests++;
                } else {
                    if (s.handNo > 0) counters.hostBuysAfterStart++;
                    if (dealtIn) counters.pendingBuys++;
                }
                return;
            }
            case 'approve': {
                const by = among(s.requests.map((q) => q.pid));
                if (!by) return;
                const op = r.chance(0.85) ? 'approve' as const : 'deny' as const;
                const first = (ledgerRow(s, by)?.bought ?? 0) === 0;
                const pending = seatOfPid(by)?.pendingBuy ?? 0;
                if (send({type: 'host', by: 'p0', op: {op, pid: by}, at: now}) !== null) return;
                if (op === 'deny') {
                    counters.declined++;
                    return;
                }
                counters.approved++;
                if (first) counters.firstBuyIns++;
                if ((seatOfPid(by)?.pendingBuy ?? 0) > pending) counters.pendingBuys++;
                return;
            }
            case 'withdraw': {
                const by = among(s.requests.map((q) => q.pid));
                if (by && send({type: 'withdraw', by, at: now}) === null) {
                    if (s.requests.some((q) => q.pid === by)) fail('a withdrawn request still waits');
                    counters.withdrawn++;
                }
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
            case 'ask': {
                if (hand?.phase !== 'complete' || !hand.result) {
                    if (astray && hand) send({type: 'ask', by: r.pick(pool), to: r.pick(pool), at: now});
                    return;
                }
                const from = among(hand.seats.filter((p) => p.folded).map((p) => p.pid));
                if (!from) return;
                const others = hand.seats.filter((p) => p.pid !== from).map((p) => p.pid);
                tryAsk(from, others.length > 0 && r.chance(0.92) ? r.pick(others) : r.pick(pool));
                return;
            }
            case 'ask-storm': {
                // A run of busy pauses: for the next few hands every pause is a storm (storm, above).
                if (hand?.phase !== 'complete' || !hand.result) return;
                stormUntil = s.handNo + ASKS.COOLDOWN_HANDS;
                storm();
                return;
            }
            case 'reply': {
                if (hand?.phase !== 'complete') return;
                const waiting = hand.asks.filter((e) => e[3] === WAITING);
                if (waiting.length === 0) return;
                const e = r.pick(waiting);
                const by = hand.seats.find((p) => p.seat === e[1])!.pid;
                const to = hand.seats.find((p) => p.seat === e[0])!.pid;
                const show = r.pick(['one', 'one', 'none', 'all'] as const);
                if (show === 'none') {
                    answerNo(e);
                    return;
                }
                const out = sendFull({type: 'reply', by, to, show, at: now});
                if (!out.ok) {
                    // Its time ran out before the answer: a no, and no answer lands.
                    if (out.reason === 'no-request' && now >= hand.startedAt + e[2] + ASKS.WAIT_MS) counters.asksExpired++;
                    return;
                }
                if (show === 'one') {
                    const summary = out.hands.find((h) => h.no === hand.no);
                    if (!summary?.players.find((p) => p.pid === by)!.seenBy.includes(to)) fail('a hand shown alone is not in its history');
                    if (s.hand!.seats.find((p) => p.pid === by)!.shown) fail('a hand shown alone was shown to everyone');
                    counters.asksShown++;
                } else if (show === 'all') {
                    if (!s.hand!.seats.find((p) => p.pid === by)!.shown) fail('a hand shown to everyone is not');
                    counters.asksShownAll++;
                }
                return;
            }
            case 'allow-asks': {
                const by = among(seated);
                if (by) send({type: 'allow-asks', by, on: r.chance(0.6), at: now});
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
        const toThrow = isLive(hand) && hand.phase === 'discard' ? hand.seats.filter((p) => !p.folded && p.hole.length === 3) : [];
        const roll = r.next();
        if ((onClock !== null || toThrow.length > 0) && roll < 0.03) {
            clockTo(nextDue(s)!.at + r.int(300));
        } else if (roll < PLAY && toThrow.length > 0) {
            // Triple T: a player still to throw throws a card — now and then one they do not hold, or
            // for an earlier throw-away, which is refused and changes nothing.
            const p = r.pick(toThrow);
            const astray = r.chance(0.06);
            const stale = !astray && r.chance(0.04);
            const card = astray ? r.pick(FULL_DECK.filter((c) => !p.hole.includes(c))) : r.pick(p.hole);
            const refused = send({type: 'discard', by: p.pid, turn: stale ? s.turn - 1 : s.turn, card, at: now});
            if (astray || stale) {
                if (refused !== (astray ? 'illegal' : 'stale')) fail(`a throw ${astray ? 'of a card not held' : 'for an earlier throw-away'} came back ${refused}`);
                counters.discardsRefused++;
            } else if (refused !== null) {
                // The clock ran to now first: a player still to throw is inside the deadline's grace.
                fail(`a throw was refused: ${refused}`);
            }
        } else if (roll < PLAY && onClock !== null) {
            const snapshot = snapshotFromState(s);
            const legal = legalFor(snapshot, onClock);
            if (!legal) fail('the actor has no moves');
            const allIn = allInOpen(legal!, snapshot, onClock);
            const move = randomMove(legal!, r, allIn);
            const by = s.seats[onClock]!.pid;
            // Over the pot limit, all in is refused and changes nothing; the cap is a raise.
            if (!allIn && legal!.raise && move.kind === 'raise' && move.to === legal!.raise.max) {
                if (send({type: 'act', by, turn: s.turn, move: {kind: 'all-in'}, at: now}) !== 'illegal') fail('an all-in over the pot limit was taken');
                counters.potLimitAllInRefused++;
            }
            if (move.kind === 'raise' && legal!.raise && move.to === legal!.raise.max && !allIn) counters.potLimitCaps++;
            const refused = send({type: 'act', by, turn: s.turn, move, at: now});
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
        if (process.env.PN_SIM_COUNTERS) console.log(JSON.stringify(counters));
        expect(short, 'nights that stopped short of their hands').toBeLessThanOrEqual(SEEDS / 10);
        expect(counters.hands).toBeGreaterThanOrEqual(SEEDS * HANDS * 0.9);
        for (const key of COUNTERS) expect(counters[key], key).toBeGreaterThan(0);
    }, Math.max(120_000, SEEDS * 1000));
});
