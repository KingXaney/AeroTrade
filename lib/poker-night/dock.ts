// The viewer's own corner of the table (components/poker-night Dock): their cards and what they
// make so far, and the one row of controls that fits the moment — the action bar on their turn
// (the moves legalFor offers, the very function the server checks them with), the early choices
// while the action is elsewhere in a hand they are still in, else the seat's own controls (sit out,
// deal me in, I'm back, show my cards, a rebuy once the stack is empty, the host's first deal).
// Pure and client-safe.

import {rankOf} from '@/lib/poker/cards';
import {evaluateCards} from '@/lib/poker/evaluator';
import {buyOptions} from '@/lib/poker-night/bank';
import {legalFor, owed} from '@/lib/poker-night/betting';
import {sizingFor, type Sizing} from '@/lib/poker-night/bet-sizing';
import {describeHand, type HandDescription} from '@/lib/poker-night/hand-name';
import type {Card, Legal, PreAction} from '@/lib/poker-night/types';
import type {PlayerView, SeatView} from '@/lib/poker-night/view-types';
import {snapshotFromView} from '@/lib/poker-night/views';

export type SeatControl = 'sit-out' | 'sit-in' | 'back';

export type DockView = {
    seat: number | null;
    seatView: SeatView | null;
    live: boolean; // a hand is being played (betting or running out)
    dealtIn: boolean; // the viewer holds cards in the current (or just finished) hand and has not folded
    folded: boolean;
    myTurn: boolean;
    legal: Legal | null;
    sizing: Sizing | null;
    hole: [Card, Card] | null;
    strength: HandDescription | null;
    pre: {options: PreAction[]; selected: PreAction | null} | null;
    control: SeatControl | null;
    canShow: boolean;
    buy: {min: number; max: number; topUp: number; rebuy: boolean} | null; // offered once the stack is empty
    deal: boolean; // the host may deal the first hand
};

// What the viewer's cards make with the board so far: before the flop a pair or the high card.
export const handStrength = (hole: readonly Card[] | null, board: readonly Card[]): HandDescription | null => {
    if (!hole || hole.length !== 2) return null;
    if (board.length >= 3) return describeHand(evaluateCards([...hole, ...board]));
    const [a, b] = [rankOf(hole[0]), rankOf(hole[1])];
    return a === b ? {category: 1, ranks: [a]} : {category: 0, ranks: [Math.max(a, b), Math.min(a, b)]};
};

// The early choices with `due` chips to call: with nothing to call, check/fold, check or call any;
// facing a bet, check/fold (a fold), call that much, or call any.
export const preOptions = (due: number): PreAction[] =>
    due > 0 ? [{kind: 'check-fold'}, {kind: 'call', amount: due}, {kind: 'call-any'}] : [{kind: 'check-fold'}, {kind: 'check'}, {kind: 'call-any'}];

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
    const control: SeatControl | null = seatView === null || seatView.state === 'leaving' ? null
        : seatView.state === 'away' ? 'back'
            : seatView.state === 'sitting-out' ? 'sit-in'
                : 'sit-out';
    const shownAlready = seatView !== null && Array.isArray(seatView.cards);
    const canShow = !!hand && hand.phase === 'complete' && view.me.hole !== null && seatView !== null && !shownAlready && view.status !== 'closed';
    const empty = seatView !== null && seatView.chips === 0 && seatView.pendingBuy === 0 && seatView.inPot === 0;
    const buys = view.ledger.find((row) => row.pid === view.me.pid)?.buys ?? 0;
    const buy = empty && !live ? buyOptions(view.config, seatView, buys) : null;
    const seated = view.seats.filter((s) => s !== null).length;
    return {
        seat, seatView, live, dealtIn: dealtIn && !folded, folded, myTurn, legal, sizing,
        hole: view.me.hole,
        strength: dealtIn && !folded ? handStrength(view.me.hole, hand?.board ?? []) : null,
        pre: pre && {options: pre.options, selected: pre.options.find((o) => samePre(o, pre.selected)) ?? null},
        control, canShow, buy,
        deal: view.status === 'open' && view.me.isHost && seated >= 2,
    };
};
