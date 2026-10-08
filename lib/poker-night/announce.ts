// What a screen reader hears as the table moves (components/poker-night LiveAnnouncer): the
// viewer's turn, with what it costs and the pot, said at once (assertive); everything else — the
// cards they are dealt, each street's cards, the other players' moves, who wins what and with
// which hand, players sitting down and leaving — in turn (polite). Pure and client-safe: the
// events are lib/poker-night/events', every sentence ANNOUNCE_COPY's.

import {ANNOUNCE_COPY, HAND_COPY, TABLE_COPY} from '@/lib/learn/copy/poker-night';
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
};

const nameAt = (ctx: AnnounceContext, seat: number, pid?: string): string => {
    const id = pid ?? playerAt(ctx.view, seat);
    return (id && ctx.people[id]?.name) || TABLE_COPY.seat(seat);
};

export const announcementsFor = (events: readonly TableEvent[], ctx: AnnounceContext): Announcements => {
    const polite: string[] = [];
    const assertive: string[] = [];
    // The clock's moves, by the id of the move they made.
    const timedOut = new Set(events.filter((e) => e.kind === 'timeout').map((e) => e.id.replace(/:timeout$/, '')));
    const winHands = new Map<number, string>();
    for (const e of events) {
        if (e.kind !== 'reveal') continue;
        for (const h of e.hands) if (h.value !== null) winHands.set(h.seat, HAND_COPY.phrase(describeHand(h.value)));
    }
    const line = (seat: number, kind: EntryKind, amount: number, allIn: boolean, id: string) => {
        if (seat === ctx.mySeat) return;
        polite.push(ANNOUNCE_COPY.move(nameAt(ctx, seat), kind, amount, allIn, timedOut.has(id)));
    };
    for (const e of events) {
        switch (e.kind) {
            case 'deal':
                if (ctx.mySeat !== null && ctx.hole && e.seats.includes(ctx.mySeat)) polite.push(ANNOUNCE_COPY.dealt(ctx.hole));
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
                polite.push(ANNOUNCE_COPY.street(e.street, e.cards));
                break;
            case 'win':
                if (e.uncontested && e.totals.length === 1) {
                    const w = e.totals[0];
                    polite.push(w.seat === ctx.mySeat ? ANNOUNCE_COPY.youWin(w.amount, null) : ANNOUNCE_COPY.uncontested(nameAt(ctx, w.seat), w.amount));
                    break;
                }
                for (const w of e.totals) {
                    const phrase = winHands.get(w.seat) ?? null;
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
