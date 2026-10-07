// The end of a hand: closing the betting, the all-in run-out, the showdown, paying the pots and
// everything a completed hand settles — the ledger's counters, buys that waited, players who left.
// Pure; works on the reducer's private copy (a Work).
//
// Closing the betting gives the uncalled bet back to its owner (even a folded one: the small blind
// folding to a short big blind gets its excess back). One player left wins without showing. Short
// of a full board with two or more in, every live hand is turned face up and the board runs out a
// street at a time on the clock. Otherwise the pots are built by contribution level and each goes
// to the strongest eligible hand, an odd chip to the first winner left of the button. Every live
// hand shows at a showdown — no mucking in this version.

import {evaluateCards} from '@/lib/poker/evaluator';
import {nextStreet, pushLog, readEntry} from '@/lib/poker-night/betting';
import {ENTRY_KINDS, revealMs, TIMING} from '@/lib/poker-night/config';
import {bestFive} from '@/lib/poker-night/hand-name';
import {cashOut, ledgerRow, recordBuy} from '@/lib/poker-night/ledger';
import {buildPots, splitPot, uncalled, type Contribution} from '@/lib/poker-night/pots';
import {eligibleSeats} from '@/lib/poker-night/seats';
import type {Hand, HandResult, HandSeat, HandSummary, LedgerRow, SettledPot, ShownHand, Work} from '@/lib/poker-night/types';

export const contribsOf = (hand: Hand): Contribution[] =>
    hand.seats.map((p) => ({seat: p.seat, amount: p.committed, folded: p.folded}));

// A hand's cards face up: its value and the five that play, once three board cards are out.
export const shownHand = (hand: Hand, p: HandSeat): ShownHand => {
    const cards: [number, number] = [p.hole[0], p.hole[1]];
    if (hand.board.length < 3) return {seat: p.seat, cards, value: null, best: []};
    const all = [...hand.board, ...p.hole];
    return {seat: p.seat, cards, value: evaluateCards(all), best: bestFive(all, p.hole).cards};
};

// Who shows first: the last street's aggressor, else the first live seat left of the button, then
// round the table.
export const showOrder = (hand: Hand): number[] => {
    const live = hand.seats.filter((p) => !p.folded).map((p) => p.seat);
    const start = hand.lastAggressor === null ? 0 : Math.max(0, live.indexOf(hand.lastAggressor));
    return [...live.slice(start), ...live.slice(0, start)];
};

export const closeBetting = (w: Work): void => {
    const s = w.state;
    const hand = s.hand!;
    hand.actor = null;
    hand.deadline = null;
    const back = uncalled(contribsOf(hand));
    if (back) {
        const p = hand.seats.find((q) => q.seat === back.seat)!;
        p.committed -= back.amount;
        p.streetBet = Math.max(0, p.streetBet - back.amount);
        s.seats[back.seat]!.stack += back.amount;
        pushLog(w, back.seat, 'refund', back.amount);
    }
    // The street's bets sweep into the pot.
    for (const p of hand.seats) {
        p.streetBet = 0;
        p.pre = null;
    }
    hand.currentBet = 0;
    const live = hand.seats.filter((p) => !p.folded);
    if (live.length === 1) {
        const winner = live[0].seat;
        const total = hand.seats.reduce((sum, p) => sum + p.committed, 0);
        complete(w, {showdown: false, refund: back, showOrder: [], hands: [],
            pots: [{amount: total, eligible: [winner], winners: [winner], shares: [total]}]});
        return;
    }
    if (hand.board.length < 5) {
        hand.phase = 'runout';
        for (const p of live) p.shown = true;
        hand.nextStreetAt = w.at + TIMING.RUNOUT_STEP_MS;
        return;
    }
    showdown(w);
};

// The run-out's next street (the clock's deal-street); the showdown once the board is full.
export const dealStreet = (w: Work): void => {
    const hand = w.state.hand!;
    nextStreet(hand);
    if (hand.board.length === 5) showdown(w);
    else hand.nextStreetAt = w.at + TIMING.RUNOUT_STEP_MS;
};

const REFUND = ENTRY_KINDS.indexOf('refund');

// The uncalled bet closing the betting gave back, read from the log (it is the only refund).
const refundOf = (hand: Hand): {seat: number; amount: number} | null => {
    for (let i = hand.log.length - 1; i >= 0; i--) {
        const [seat, kind, amount] = hand.log[i];
        if (kind === REFUND) return {seat, amount};
    }
    return null;
};

export const showdown = (w: Work): void => {
    const hand = w.state.hand!;
    const live = hand.seats.filter((p) => !p.folded);
    const value = new Map<number, number>();
    for (const p of live) {
        value.set(p.seat, evaluateCards([...hand.board, ...p.hole]));
        p.shown = true;
    }
    const pots: SettledPot[] = buildPots(contribsOf(hand)).map((pot) => {
        // A pot with nobody eligible holds only folded chips, which a refund leaves none of.
        const contenders = pot.eligible.length > 0 ? pot.eligible : live.map((p) => p.seat);
        const top = Math.max(...contenders.map((seat) => value.get(seat)!));
        const winners = contenders.filter((seat) => value.get(seat) === top);
        return {amount: pot.amount, eligible: pot.eligible, winners, shares: splitPot(pot.amount, winners)};
    });
    const order = showOrder(hand);
    const hands = order.map((seat) => shownHand(hand, hand.seats.find((p) => p.seat === seat)!));
    complete(w, {showdown: true, refund: refundOf(hand), pots, hands, showOrder: order});
};

const rowOf = (w: Work, pid: string): LedgerRow => {
    const row = ledgerRow(w.state, pid);
    if (!row) throw new Error('a dealt player has no ledger row');
    return row;
};

// A hand's history record, holding every hole card (PRIVATE: historyView filters it).
export const summarize = (hand: Hand): HandSummary => {
    const result = hand.result!;
    return {
        no: hand.no, startedAt: hand.startedAt, completedAt: result.completedAt, button: hand.button,
        smallBlind: hand.smallBlind, bigBlind: hand.bigBlind, ante: hand.ante, board: [...hand.board],
        players: hand.seats.map((p) => ({
            seat: p.seat, pid: p.pid, startStack: p.startStack, net: result.nets.find((n) => n.seat === p.seat)?.net ?? 0,
            hole: [p.hole[0], p.hole[1]], shown: p.shown,
        })),
        log: hand.log.map((e) => readEntry(hand, e)),
        truncated: hand.logDropped > 0,
        pots: structuredClone(result.pots),
        hands: structuredClone(result.hands),
    };
};

// Shares to stacks, the ledger's counters, the history record; then the seats: buys that waited
// land (up to the cap, and never at a closing table), players who left are cashed out, and with
// rebuys off so is anyone at zero.
// Then the table closes if the host ended it, or the next hand is timed after the reveal.
export const complete = (w: Work, r: Omit<HandResult, 'completedAt' | 'nets' | 'revealMs'>): void => {
    const s = w.state;
    const hand = s.hand!;
    const won = new Map<number, number>();
    for (const pot of r.pots) pot.winners.forEach((seat, i) => won.set(seat, (won.get(seat) ?? 0) + pot.shares[i]));
    for (const p of hand.seats) {
        const seat = s.seats[p.seat]!;
        const share = won.get(p.seat) ?? 0;
        seat.stack += share;
        const row = rowOf(w, p.pid);
        if (share > 0) {
            row.wins++;
            row.biggestWin = Math.max(row.biggestWin, share);
        }
        if (p.allIn) row.allIns++;
        row.peakChips = Math.max(row.peakChips, seat.stack);
    }
    hand.phase = 'complete';
    hand.actor = null;
    hand.deadline = null;
    hand.nextStreetAt = null;
    hand.currentBet = 0;
    hand.result = {
        completedAt: w.at, showdown: r.showdown, refund: r.refund, pots: r.pots, hands: r.hands, showOrder: r.showOrder,
        nets: hand.seats.map((p) => ({seat: p.seat, net: (won.get(p.seat) ?? 0) - p.committed})),
        revealMs: revealMs(r),
    };
    w.hands.push(summarize(hand));
    w.ledgerDirty = true;
    s.seats.forEach((seat, i) => {
        if (!seat) return;
        if (seat.leaving) {
            cashOut(w, i, seat.removed ? 'removed' : 'cash-out');
            return;
        }
        if (seat.pendingBuy > 0) {
            // At a closing table everyone is cashed out next: a buy landing now would only be paid back.
            const amount = s.closing ? 0 : Math.min(seat.pendingBuy, s.config.buyInMax - seat.stack);
            const kind = seat.stack === 0 ? 'rebuy' : 'top-up';
            seat.pendingBuy = 0;
            if (amount > 0) {
                seat.stack += amount;
                recordBuy(w, seat.pid, amount, kind);
            }
        }
        if (s.config.rebuys === 'off' && seat.stack === 0) cashOut(w, i, 'cash-out');
    });
    if (s.closing) closeTable(w);
    else s.nextHandAt = eligibleSeats(s).length >= 2 ? w.at + Math.max(s.config.pauseSeconds * 1000, hand.result.revealMs) : null;
};

// Everyone is cashed out and the table closes; the last hand and the ledger stay for the summary.
export const closeTable = (w: Work): void => {
    const s = w.state;
    s.seats.forEach((seat, i) => {
        if (seat) cashOut(w, i, 'cash-out');
    });
    s.requests = [];
    s.status = 'closed';
    s.closing = false;
    s.nextHandAt = null;
    w.ledgerDirty = true;
};
