// The viewer's own corner of the table (components/poker-night Dock): their cards and what they
// make so far, and the one row of controls that fits the moment — the action bar on their turn
// (the moves legalFor offers, the very function the server checks them with), the early choices
// while the action is elsewhere in a hand they are still in, else the seat's own controls (sit out,
// deal me in, I'm back, show my cards, leave, a rebuy once the stack is empty, the host's first
// deal) — offered whenever the viewer is not playing a hand, the pause after a showdown they reached
// included. A folded hand stays the viewer's to see until the next deal. What the seat does when the
// hand ends is the viewer's own part of the view (MeView.next), since the plate keeps reading Folded:
// once they have left mid-hand the row says so and offers nothing more; while they leave after the
// hand (playing it out as usual) the dock says so with Stay, which takes it back; while a "Sit out
// next hand" waits, it says so and offers to take it back. "Leave after this hand" itself is one tap
// while they hold cards (dock.leaveAfter), and once folded the break's Leave sends it. Chips that
// wait for the host's yes (a request) say so, with Cancel, in place of the rebuy. Pure and
// client-safe.

import {rankOf} from '@/lib/poker/cards';
import {buyOptions} from '@/lib/poker-night/bank';
import {legalFor, owed} from '@/lib/poker-night/betting';
import {leaveAfterOf, leftNow, type LeaveAfter} from '@/lib/poker-night/overlays';
import {sizingFor, type Sizing} from '@/lib/poker-night/bet-sizing';
import {describeHand, type HandDescription} from '@/lib/poker-night/hand-name';
import type {Card, Legal, PreAction, Variant} from '@/lib/poker-night/types';
import {handValue} from '@/lib/poker-night/variants';
import type {PlayerView, SeatView} from '@/lib/poker-night/view-types';
import {ledgerRowOf, snapshotFromView} from '@/lib/poker-night/views';

export type SeatControl = 'sit-out' | 'sit-in' | 'back';

export type DockView = {
    seat: number | null;
    seatView: SeatView | null;
    live: boolean; // a hand is being played (betting or running out)
    dealtIn: boolean; // the viewer holds cards in the current (or just finished) hand and has not folded
    folded: boolean; // folded in the hand being played
    // Dealt into the view's hand (live or just finished) and folded: the cards stay the viewer's to
    // see, dimmed, until the next deal; nobody else sees them unless the viewer shows them.
    mucked: boolean;
    // The seat's own "Sit out" and "Leave": whenever the viewer is seated but not playing a hand —
    // between hands, after a showdown they reached (the results pause), and once folded.
    sitOut: boolean;
    leave: boolean;
    // Left during the hand in play: cashed out when it ends (the plate may still read Folded).
    leaving: boolean;
    // Leaving once the hand in play ends, playing it out as usual (MeView.next 'leave-after'): the
    // dock says so beside the cards, with Stay.
    leavingAfter: boolean;
    // "Leave after this hand", one tap, while the viewer holds cards in the hand in play.
    leaveAfter: LeaveAfter | null;
    // The viewer's own request for chips, waiting for the host (its amount), and whether it is all
    // they have: a new seat, or a rebuy at zero, sits with nothing until the host says yes.
    request: number | null;
    waitingChips: boolean;
    // A "Sit out next hand" waits for the deal (the viewer's or the host's): the dock says so, and once
    // the viewer is free to act on it the row offers "Deal me in" (sit-in), which takes it back.
    sitOutNext: boolean;
    takeBack: boolean;
    myTurn: boolean;
    legal: Legal | null;
    sizing: Sizing | null;
    hole: Card[] | null;
    strength: HandDescription | null;
    pre: {options: PreAction[]; selected: PreAction | null} | null;
    control: SeatControl | null;
    canShow: boolean;
    buy: {min: number; max: number; topUp: number; rebuy: boolean; first: boolean} | null; // offered once the stack is empty and no request waits
    deal: boolean; // the host may deal the first hand
};

// What the viewer's cards make with the board so far, by the hand's game (variants.handValue, the
// server's own): in Texas hold'em (and Triple T once it holds two) before the flop a pair or the high
// card; in PLO nothing before the flop — four cards make no hand of their own — then exactly two of
// them with three from the board. Nothing for cards the game does not play (a Triple T hand of three).
export const handStrength = (variant: Variant, hole: readonly Card[] | null, board: readonly Card[]): HandDescription | null => {
    if (!hole) return null;
    if (variant === 'plo') return hole.length === 4 && board.length >= 3 ? describeHand(handValue('plo', hole, board)) : null;
    if (hole.length !== 2) return null;
    if (board.length >= 3) return describeHand(handValue(variant, hole, board));
    const [a, b] = [rankOf(hole[0]), rankOf(hole[1])];
    return a === b ? {category: 1, ranks: [a]} : {category: 0, ranks: [Math.max(a, b), Math.min(a, b)]};
};

// The early choices with `due` chips to call: with nothing to call, check/fold, check or call any;
// facing a bet, check/fold (a fold), call that much, or call any.
export const preOptions = (due: number): PreAction[] =>
    due > 0 ? [{kind: 'check-fold'}, {kind: 'call', amount: due}, {kind: 'call-any'}] : [{kind: 'check-fold'}, {kind: 'check'}, {kind: 'call-any'}];

// A pre-action's key: its kind, and a call's amount.
export const preKeyOf = (p: PreAction): string => (p.kind === 'call' ? `call-${p.amount}` : p.kind);

// What the Dock keys the early-choices row by: the hand and the choices on offer, so a new deal or a
// choice that changed under the thumb ("Check" becoming "Call 40") mounts it afresh, behind its tap
// shield (components/poker-night/PreActions).
export const preRowKey = (handNo: number | null, options: readonly PreAction[]): string =>
    `${handNo ?? 0}:${options.map(preKeyOf).join(',')}`;

export const samePre = (a: PreAction | null, b: PreAction | null): boolean =>
    a !== null && b !== null && a.kind === b.kind && (a.kind !== 'call' || (b.kind === 'call' && a.amount === b.amount));

export const dockView = (view: PlayerView): DockView => {
    const seat = view.me.seat;
    const seatView = seat === null ? null : view.seats[seat] ?? null;
    const hand = view.hand;
    const live = !!hand && hand.phase !== 'complete';
    const holding = seatView !== null && seatView.cards !== 'none';
    const folded = seatView?.state === 'folded';
    const dealtIn = !!hand && view.me.hole !== null && holding;
    const snapshot = snapshotFromView(view);
    const legal = seat === null ? null : legalFor(snapshot, seat);
    const myTurn = legal !== null;
    const sizing = sizingFor(view, legal, seat, view.config.smallBlind);
    // Early choices: a hand being bet, someone else to act, the viewer still in it with chips.
    const canPre = !myTurn && hand?.phase === 'betting' && seat !== null && seatView?.state === 'in-hand' && dealtIn;
    const pre = canPre ? {options: preOptions(owed(snapshot, seat)), selected: view.me.pre} : null;
    // Left mid-hand: the plate reads Folded or All in until the hand ends, the viewer's own part says so.
    const leaving = leftNow(view);
    const leavingAfter = !leaving && seatView !== null && view.me.next === 'leave-after';
    const request = view.requests.find((r) => r.pid === view.me.pid)?.amount ?? null;
    const control: SeatControl | null = seatView === null || leaving ? null
        : seatView.state === 'away' ? 'back'
            : seatView.state === 'sitting-out' ? 'sit-in'
                : 'sit-out';
    const shownAlready = seatView !== null && Array.isArray(seatView.cards);
    const canShow = !!hand && hand.phase === 'complete' && view.me.hole !== null && seatView !== null && !shownAlready && view.status !== 'closed';
    const empty = seatView !== null && seatView.chips === 0 && seatView.pendingBuy === 0 && seatView.inPot === 0;
    const row = ledgerRowOf(view, view.me.pid);
    const waitingChips = empty && request !== null;
    // An empty seat has nothing in a live pot, so it is never playing the hand in play: its chips may
    // be asked for (or land) while one is being played, as between hands.
    const buy = empty && request === null && !leavingAfter ? buyOptions(view.config, seatView, row) : null;
    const seated = view.seats.filter((s) => s !== null).length;
    const deal = view.status === 'open' && view.me.isHost && seated >= 2;
    // Still playing the hand in play: its cards in front of them, not folded.
    const playing = live && dealtIn && !folded;
    // Dealt into the view's hand, folded (live or complete): a dealt hand's cards read 'none' then.
    const mucked = !!hand && view.me.hole !== null && seatView !== null && seatView.cards === 'none';
    const free = seatView !== null && !leaving && !leavingAfter && view.status !== 'closed' && !playing && !deal;
    // Already asked (by the viewer or the host) for the hand in play: nothing more to ask.
    const sitOutNext = live && !leaving && view.me.next === 'sit-out';
    return {
        seat, seatView, live, dealtIn: dealtIn && !folded, folded, mucked, myTurn, legal, sizing,
        hole: view.me.hole,
        strength: dealtIn && !folded && hand ? handStrength(hand.variant, view.me.hole, hand.boards[0] ?? []) : null,
        pre: pre && {options: pre.options, selected: pre.options.find((o) => samePre(o, pre.selected)) ?? null},
        control, canShow, buy, deal,
        sitOut: free && control === 'sit-out' && !sitOutNext && !waitingChips,
        leave: free,
        leaving,
        leavingAfter,
        leaveAfter: leaveAfterOf(view),
        request,
        waitingChips,
        sitOutNext,
        takeBack: free && control === 'sit-out' && sitOutNext,
    };
};
