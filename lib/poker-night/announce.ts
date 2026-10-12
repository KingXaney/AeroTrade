// What a screen reader hears as the table moves (components/poker-night LiveAnnouncer): the
// viewer's turn, with what it costs and the pot, and in Triple T the three cards to throw one of away,
// said at once (assertive); everything else — a new game from this hand (the host switched to PLO
// between hands), the cards they are dealt, the card they threw away (or the clock threw for them),
// the throw-away over, each street's cards, the other players' moves, who wins what and with which
// hand, players sitting down and leaving — in turn (polite). Pure and client-safe: the events are
// lib/poker-night/events', every sentence ANNOUNCE_COPY's or DISCARD_COPY's.

import {ANNOUNCE_COPY, DISCARD_COPY, HAND_COPY, MODE_COPY, TABLE_COPY} from '@/lib/learn/copy/poker-night';
import type {Card} from '@/lib/poker/cards';
import {potTotal} from '@/lib/poker-night/bet-sizing';
import {legalFor} from '@/lib/poker-night/betting';
import type {TableEvent} from '@/lib/poker-night/events';
import {describeHand} from '@/lib/poker-night/hand-name';
import {playerAt} from '@/lib/poker-night/reveal';
import type {EntryKind} from '@/lib/poker-night/types';
import type {People, TableView} from '@/lib/poker-night/view-types';
import {snapshotFromView} from '@/lib/poker-night/views';

export type Announcements = {polite: string[]; assertive: string[]};

export type AnnounceContext = {
    view: Pick<TableView, 'seats' | 'hand'>;
    people: People;
    mySeat: number | null;
    hole: readonly Card[] | null;
    // Triple T: the card the viewer threw away this hand (MeView.discard).
    discard?: Card | null;
};

const nameAt = (ctx: AnnounceContext, seat: number, pid?: string): string => {
    const id = pid ?? playerAt(ctx.view, seat);
    return (id && ctx.people[id]?.name) || TABLE_COPY.seat(seat);
};

// How many boards the hand's board events turn (one a board each street).
const boardsOf = (events: readonly TableEvent[], handNo: number): number =>
    Math.max(1, ...events.flatMap((e) => (e.kind === 'board' && e.handNo === handNo ? [e.board + 1] : [])));

export const announcementsFor = (events: readonly TableEvent[], ctx: AnnounceContext): Announcements => {
    const polite: string[] = [];
    const assertive: string[] = [];
    // The clock's moves, by the id of the move they made.
    const timedOut = new Set(events.filter((e) => e.kind === 'timeout').map((e) => e.id.replace(/:timeout$/, '')));
    // Each shown hand's name on each board, from the reveal.
    const winHands = new Map<number, (string | null)[]>();
    for (const e of events) {
        if (e.kind !== 'reveal') continue;
        for (const h of e.hands) winHands.set(h.seat, h.values.map((v) => (v === null ? null : HAND_COPY.phrase(describeHand(v)))));
    }
    const phraseOf = (seat: number, board = 0): string | null => winHands.get(seat)?.[board] ?? null;
    const line = (seat: number, kind: EntryKind, amount: number, allIn: boolean, id: string) => {
        if (seat === ctx.mySeat) return;
        polite.push(ANNOUNCE_COPY.move(nameAt(ctx, seat), kind, amount, allIn, timedOut.has(id)));
    };
    for (const e of events) {
        switch (e.kind) {
            case 'deal':
                if (e.changed) polite.push(ANNOUNCE_COPY.newGame(MODE_COPY.spokenLabel(e.variant, e.boards)));
                if (ctx.mySeat === null || !ctx.hole || !e.seats.includes(ctx.mySeat)) break;
                // Triple T: three cards, one to throw away now — said at once.
                if (e.variant === 'triple-t' && ctx.hole.length === 3) assertive.push(DISCARD_COPY.announceStart(ctx.hole));
                else polite.push(ANNOUNCE_COPY.dealt(ctx.hole));
                break;
            case 'discard':
                if (e.seat !== ctx.mySeat) polite.push(ANNOUNCE_COPY.move(nameAt(ctx, e.seat), 'discard', 0, false, e.timeout));
                else if (ctx.discard != null) polite.push(e.timeout ? DISCARD_COPY.timedOut(ctx.discard) : DISCARD_COPY.thrown(ctx.discard));
                break;
            case 'discarded':
                polite.push(DISCARD_COPY.announceDone);
                break;
            case 'chips-out':
                // The blinds and antes are said once, in the log; the moves are said as they happen.
                if (e.move === 'ante' || e.move === 'small-blind' || e.move === 'big-blind') break;
                line(e.seat, e.move, e.move === 'raise' ? e.to : e.amount, e.allIn, e.id);
                break;
            case 'check':
            case 'fold':
                line(e.seat, e.kind, 0, false, e.id);
                break;
            case 'board':
                polite.push(ANNOUNCE_COPY.street(e.street, e.cards, e.board > 0 || boardsOf(events, e.handNo) > 1 ? e.board : null));
                break;
            case 'win':
                if (e.uncontested && e.totals.length === 1) {
                    const w = e.totals[0];
                    polite.push(w.seat === ctx.mySeat ? ANNOUNCE_COPY.youWin(w.amount, null) : ANNOUNCE_COPY.uncontested(nameAt(ctx, w.seat), w.amount));
                    break;
                }
                if (e.boards > 1 && !e.uncontested) {
                    // Two or three boards: what each player took on each board, board by board.
                    for (let board = 0; board < e.boards; board++) {
                        const won = new Map<number, number>();
                        for (const part of e.pots) if (part.board === board) for (const w of part.winners) won.set(w.seat, (won.get(w.seat) ?? 0) + w.share);
                        for (const [seat, amount] of [...won].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1] || a[0] - b[0])) {
                            const phrase = phraseOf(seat, board);
                            polite.push(seat === ctx.mySeat ? ANNOUNCE_COPY.youWinBoard(board, amount, phrase) : ANNOUNCE_COPY.wins(nameAt(ctx, seat), amount, phrase, null, board));
                        }
                    }
                    break;
                }
                for (const w of e.totals) {
                    const phrase = phraseOf(w.seat);
                    polite.push(w.seat === ctx.mySeat ? ANNOUNCE_COPY.youWin(w.amount, phrase) : ANNOUNCE_COPY.wins(nameAt(ctx, w.seat), w.amount, phrase));
                }
                break;
            case 'join':
                if (e.seat !== ctx.mySeat) polite.push(ANNOUNCE_COPY.joined(nameAt(ctx, e.seat, e.pid)));
                break;
            case 'leave':
                polite.push(ANNOUNCE_COPY.left(nameAt(ctx, e.seat, e.pid)));
                break;
            case 'turn': {
                if (!e.mine || ctx.mySeat === null) break;
                const legal = legalFor(snapshotFromView(ctx.view), ctx.mySeat);
                assertive.push(ANNOUNCE_COPY.yourTurn(legal?.call ?? 0, potTotal(ctx.view)));
                break;
            }
            default:
                break;
        }
    }
    return {polite, assertive};
};
