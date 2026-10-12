// The end of a hand: closing the betting, the all-in run-out, the showdown, paying the pots and
// everything a completed hand settles — the ledger's counters, buys that waited, players who left.
// Pure; works on the reducer's private copy (a Work).
//
// Closing the betting gives the uncalled bet back to its owner (even a folded one: the small blind
// folding to a short big blind gets its excess back). One player left wins without showing. Short
// of a full board with two or more in, every live hand is turned face up and the board runs out a
// street at a time on the clock — every board together. Otherwise the pots are built by
// contribution level, each split evenly between the boards (the odd chips to the first boards), and
// each board's part goes to the strongest eligible hand on that board, an odd chip to the first
// winner left of the button. Every live hand shows at a showdown — no mucking in this version.

import {nextStreet, pushLog, readEntry} from '@/lib/poker-night/betting';
import {ASK_ANSWERS, ENTRY_KINDS, revealMs, TIMING} from '@/lib/poker-night/config';
import {cashOut, ledgerRow, recordBuy} from '@/lib/poker-night/ledger';
import {buildPots, paidParts, uncalled, type Contribution} from '@/lib/poker-night/pots';
import {eligibleSeats} from '@/lib/poker-night/seats';
import {handValue} from '@/lib/poker-night/variants';
import type {Hand, HandResult, HandSeat, HandSummary, LedgerRow, SettledPot, ShownHand, Work} from '@/lib/poker-night/types';

export const contribsOf = (hand: Hand): Contribution[] =>
    hand.seats.map((p) => ({seat: p.seat, amount: p.committed, folded: p.folded}));

// A hand's cards face up: the cards it holds (a Triple T hand the two it kept). What they make on
// each board is read from them (lib/poker-night/variants.readShown).
export const shownHand = (p: HandSeat): ShownHand => ({seat: p.seat, cards: [...p.hole]});

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
            pots: [{amount: total, eligible: [winner], winners: [[winner]], shares: [[total]]}]});
        return;
    }
    if (hand.boards[0].length < 5) {
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
    if (hand.boards[0].length === 5) showdown(w);
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
    // Each live hand's value on each board.
    const values = hand.boards.map((board) => new Map(live.map((p) => [p.seat, handValue(hand.variant, p.hole, board)])));
    for (const p of live) p.shown = true;
    const pots: SettledPot[] = buildPots(contribsOf(hand)).map((pot) => {
        // A pot with nobody eligible holds only folded chips, which a refund leaves none of.
        const contenders = pot.eligible.length > 0 ? pot.eligible : live.map((p) => p.seat);
        const winners = values.map((value) => {
            const top = Math.max(...contenders.map((seat) => value.get(seat)!));
            return contenders.filter((seat) => value.get(seat) === top);
        });
        return {amount: pot.amount, eligible: pot.eligible, winners, shares: paidParts({amount: pot.amount, winners}).map((part) => part.shares)};
    });
    const order = showOrder(hand);
    const hands = order.map((seat) => shownHand(hand.seats.find((p) => p.seat === seat)!));
    complete(w, {showdown: true, refund: refundOf(hand), pots, hands, showOrder: order});
};

const rowOf = (w: Work, pid: string): LedgerRow => {
    const row = ledgerRow(w.state, pid);
    if (!row) throw new Error('a dealt player has no ledger row');
    return row;
};

const SHOWN_TO_ONE = ASK_ANSWERS.indexOf('shown');

// A hand's history record, holding every hole card and every card thrown away (PRIVATE:
// historyView filters it), and who was shown which hand alone, answering their ask.
export const summarize = (hand: Hand): HandSummary => {
    const result = hand.result!;
    const pidAt = (seat: number) => hand.seats.find((q) => q.seat === seat)?.pid ?? '';
    return {
        no: hand.no, startedAt: hand.startedAt, completedAt: result.completedAt, variant: hand.variant, button: hand.button,
        smallBlind: hand.smallBlind, bigBlind: hand.bigBlind, ante: hand.ante, boards: hand.boards.map((b) => [...b]),
        players: hand.seats.map((p) => ({
            seat: p.seat, pid: p.pid, startStack: p.startStack, net: result.nets.find((n) => n.seat === p.seat)?.net ?? 0,
            hole: [...p.hole], shown: p.shown,
            discard: hand.discards.find(([seat]) => seat === p.seat)?.[1] ?? null,
            seenBy: hand.asks.filter((e) => e[1] === p.seat && e[3] === SHOWN_TO_ONE).map((e) => pidAt(e[0])),
        })),
        log: hand.log.map((e) => readEntry(hand, e)),
        truncated: hand.logDropped > 0,
        pots: structuredClone(result.pots),
        hands: structuredClone(result.hands),
    };
};

// Shares to stacks, the ledger's counters, the history record; then the seats: players who left, or
// chose to leave after this hand, are cashed out (a buy that waited for them dropped), buys that
// waited land (up to the cap, and never at a closing table), and with rebuys off so is anyone at
// zero — but a newcomer whose first chips wait for the host.
// Then the table closes if the host ended it, or the next hand is timed after the reveal.
export const complete = (w: Work, r: Omit<HandResult, 'completedAt' | 'nets' | 'revealMs'>): void => {
    const s = w.state;
    const hand = s.hand!;
    const won = new Map<number, number>();
    for (const pot of r.pots) {
        pot.winners.forEach((board, k) => board.forEach((seat, j) => won.set(seat, (won.get(seat) ?? 0) + pot.shares[k][j])));
    }
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
        revealMs: revealMs({showdown: r.showdown, pots: r.pots, boards: hand.boards.length}),
    };
    w.hands.push(summarize(hand));
    w.ledgerDirty = true;
    s.seats.forEach((seat, i) => {
        if (!seat) return;
        if (seat.leaving || seat.leaveAfter) {
            seat.pendingBuy = 0;
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
        if (s.config.rebuys === 'off' && seat.stack === 0 && !s.requests.some((q) => q.pid === seat.pid)) cashOut(w, i, 'cash-out');
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
