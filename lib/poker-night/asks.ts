// Asks to see a hand, read: when one runs out, how it stands at a moment, who a player may ask, and
// the cooldowns. Pure and client-safe — the engine (lib/poker-night/engine: ask, reply) and the
// viewer's own view (lib/poker-night/views.playerView) read them with these same functions, so the
// page offers exactly the asks the server takes.
//
// An ask is a hand's private AskEntry, [from, to, at, answer], by the seats the two played the hand
// from; only those two ever see it. See engine.ts for the rules.

import {ASK_ANSWERS, ASKS} from '@/lib/poker-night/config';
import type {AskAnswer, AskEntry, Hand, HandSeat, TableState} from '@/lib/poker-night/types';
import type {AskBlock} from '@/lib/poker-night/view-types';

export const ASK_WAITING = ASK_ANSWERS.indexOf('waiting');
export const ASK_SHOWN = ASK_ANSWERS.indexOf('shown');
export const ASK_EVERYONE = ASK_ANSWERS.indexOf('everyone');
export const ASK_NO = ASK_ANSWERS.indexOf('no');
export const ASK_EXPIRED = ASK_ANSWERS.indexOf('expired');

// When a waiting ask counts as a no.
export const askDeadline = (hand: Pick<Hand, 'startedAt'>, ask: AskEntry): number => hand.startedAt + ask[2] + ASKS.WAIT_MS;

// How an ask stands at `now`: a waiting one past its deadline is 'expired' even before a write says
// so (the engine records it at the next ask, answer, show or deal).
export const answerAt = (hand: Pick<Hand, 'startedAt'>, ask: AskEntry, now: number): AskAnswer =>
    ask[3] === ASK_WAITING && now >= askDeadline(hand, ask) ? 'expired' : ASK_ANSWERS[ask[3]];

// The completed hand asks are about, or null while a hand is live or there is none.
export const askedHand = (state: Pick<TableState, 'hand'>): Hand | null =>
    state.hand && state.hand.phase === 'complete' && state.hand.result ? state.hand : null;

// The place `pid` played in a hand, or null.
export const placeOf = (hand: Pick<Hand, 'seats'>, pid: string): HandSeat | null => hand.seats.find((p) => p.pid === pid) ?? null;

// Whether `from` is kept from asking `to` about hand `no` (a no, or no answer, within the last
// ASKS.COOLDOWN_HANDS hands).
export const coolingDown = (state: Pick<TableState, 'askCooldowns'>, from: string, to: string, no: number): boolean =>
    state.askCooldowns.some(([a, b, until]) => a === from && b === to && until >= no);

// Every player `pid` could ask about the completed hand — dealt into it, cards not shown, not asked by
// `pid` already this hand — each with what keeps `pid` from asking them now, or null when nothing
// does: the player turned asks off, `pid` is cooling down from them (a no, or no answer, within the
// last ASKS.COOLDOWN_HANDS hands), an ask of `pid`'s still waits, or `pid` has made every ask a hand
// allows (ASKS.PER_HAND). Empty while `pid` may ask nobody at all: no completed hand, or `pid` was not
// dealt into it or did not fold. The page greys a blocked ask and says why (the viewer's own view,
// MeView.askBlocked); the engine refuses exactly these.
export const askChoices = (state: Pick<TableState, 'hand' | 'noAsks' | 'askCooldowns'>, pid: string, now: number): {pid: string; block: AskBlock | null}[] => {
    const hand = askedHand(state);
    if (!hand) return [];
    const me = placeOf(hand, pid);
    if (!me || !me.folded) return [];
    const mine = hand.asks.filter((e) => e[0] === me.seat);
    const waiting = mine.some((e) => answerAt(hand, e, now) === 'waiting');
    const spent = mine.length >= ASKS.PER_HAND;
    return hand.seats
        .filter((p) => p.pid !== pid && !p.shown && !mine.some((e) => e[1] === p.seat))
        .map((p) => ({
            pid: p.pid,
            block: state.noAsks.includes(p.pid) ? 'asks-off' : coolingDown(state, pid, p.pid, hand.no) ? 'cooldown' : waiting ? 'waiting' : spent ? 'limit' : null,
        }));
};

// Who `pid` may ask now (pids, in hand order): the hand complete, `pid` dealt into it and folded, no
// ask of theirs still waiting, fewer than ASKS.PER_HAND asks made; each player whose cards were not
// shown, whose asks are on, whom `pid` has not asked about this hand and is not cooling down from.
export const canAskFrom = (state: Pick<TableState, 'hand' | 'noAsks' | 'askCooldowns'>, pid: string, now: number): string[] =>
    askChoices(state, pid, now).filter((c) => c.block === null).map((c) => c.pid);
