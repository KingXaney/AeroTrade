// What one attempt of the store's compare-and-set loop does with a room it has just read: the
// decision, pure, so every branch is unit-tested with a stacked deck. lib/poker-night/store.
// mutateRoom reads the document, calls planMutation, writes what it says behind the seq guard and
// retries on a lost race; a lost attempt's deck was never seen, so dropping it is safe.
//
// In order:
// 1. An action id already in the applied ring is a repeat (a double tap, a retried request): answer
//    with the room as it is.
// 2. A room idle for TIMING.IDLE_CLOSE_MS closes instead of running the step.
// 3. The clock runs to the moment the request arrived (`receivedAt`, never later than now), so a
//    move that arrived in time is never beaten by a timeout that fell due while it waited; then the
//    step runs at that moment; then the clock runs on to now. Every pass judges a turn's timeout as
//    the requester (`by`) runs it (clock.dueFor): the actor's own request by the turn's own time,
//    any other writer TIMING.TIMEOUT_SLACK_MS later — so a tick or another player's request that
//    reaches the compare-and-set first does not time out a move that arrived in time and is still
//    on its way.
// 4. A refused step still lets the clock's own changes up to now commit (the table must not stall
//    on a refusal), but its action id is not recorded: the same id may try again.
// 5. Nothing changed at all: no write.
// 6. A write says whether anyone but its author can see it (seenByOthers): a pre-action, a plan to
//    leave after the hand or to sit out from the next deal (while the hand is live), an ask to see a
//    hand and its answer, the "let others ask" setting and the cooldowns show only in their players'
//    own views, so such a commit moves the compare-and-set's seq but not the public one
//    (room-doc.publicSeq), and nothing is published — no other browser can read their timing off a
//    version that moved.
// 7. And whom else it concerns (nudgesOf): every player with a row but its author whose own view it
//    changed where the public table does not show it — the player asked, the one who asked, a player
//    the host sat out mid-hand. Each one's row counts a nudge (withNudges: written with the players,
//    moving neither peopleV nor the public seq), and the store tells them on their own channel, so
//    they read their view though the public seq did not move.

import type {PokerNightErrorCode} from '@/lib/poker-night/http';
import {clockStep, idleCloseDue, idleCloseStep, withApplied, type JoinResult, type RoomCore, type Step, type StepResult} from '@/lib/poker-night/room';
import {isLive} from '@/lib/poker-night/seats';
import type {DeckSource, HandSummary, TableState} from '@/lib/poker-night/types';
import {nudgeKey} from '@/lib/poker-night/views';

export type MutationInput = {
    core: RoomCore;
    step: Step | null; // null: the clock alone (POST tick)
    applied: readonly string[];
    key: string | null; // room.appliedKey(pid, actionId) when the request carries an action id
    by: string | null; // the requester's pid (POST action); null for a tick or a join
    lastActivityAt: number;
    receivedAt: number;
    now: number;
    source: DeckSource;
};

export type Plan =
    | {kind: 'duplicate'}
    | {kind: 'refused'; code: PokerNightErrorCode}
    | {kind: 'unchanged'; join: JoinResult | null}
    // A write. refusal set: the clock moved (or the idle room closed) but the request itself was
    // refused, and that is its answer.
    // visible: seenByOthers(before, after). nudge: nudgesOf(before, after, by, now).
    | {
        kind: 'commit'; core: RoomCore; applied: string[]; hands: HandSummary[]; ledgerDirty: boolean; join: JoinResult | null;
        refusal: PokerNightErrorCode | null; visible: boolean; nudge: string[];
    };

type Done = Extract<StepResult, {ok: true}>;

// The state with every part only its own player may see left out: the pre-actions, the plans to
// leave after the hand, a sit-out asked for while the hand is live (the plate shows it only once the
// hand completes), the hand's asks, who turned asks off and the cooldowns. The decks, the holes and
// the thrown-away cards move only with a deal or a throw-away, which everyone sees.
const withoutPrivate = (state: TableState): TableState => {
    const hand = state.hand;
    const live = isLive(hand);
    return {
        ...state,
        seats: state.seats.map((seat) => (seat && (seat.leaveAfter || (live && seat.sitOutNext)) ? {...seat, leaveAfter: false, sitOutNext: live ? false : seat.sitOutNext} : seat)),
        hand: hand ? {...hand, seats: hand.seats.map((p) => (p.pre === null ? p : {...p, pre: null})), asks: []} : null,
        noAsks: [],
        askCooldowns: [],
    };
};

// Whether a write changes anything a viewer other than its author could see: anything at all but
// the private parts above. The people, the bans and peopleV count; the out-of-band parts never change
// in a step.
export const seenByOthers = (before: RoomCore, after: RoomCore): boolean => {
    if (after === before) return false;
    if (after.players !== before.players || after.bannedKeys !== before.bannedKeys || after.peopleV !== before.peopleV) return true;
    if (after.state === before.state) return false;
    return JSON.stringify(withoutPrivate(after.state)) !== JSON.stringify(withoutPrivate(before.state));
};

// The players other than the write's author (`by`) whose own view it changed where the public table
// does not show it (views.nudgeKey, both sides read at the commit's `now`): the ones to nudge.
export const nudgesOf = (before: TableState, after: TableState, by: string | null, now: number): string[] => {
    if (after === before) return [];
    const pids = new Set<string>();
    for (const s of [before, after]) {
        for (const seat of s.seats) if (seat) pids.add(seat.pid);
        for (const p of s.hand?.seats ?? []) pids.add(p.pid);
    }
    return [...pids].filter((pid) => pid !== by && nudgeKey(before, pid, now) !== nudgeKey(after, pid, now)).sort();
};

// The clock's and the idle close's steps never refuse.
const done = (r: StepResult): Done => {
    if (!r.ok) throw new Error(`poker night: a clock step refused (${r.code})`);
    return r;
};

// Each nudged player's row with its count moved on. Applied after the commit's visibility is
// decided: a nudge is no one else's business.
export const withNudges = (core: RoomCore, pids: readonly string[]): RoomCore =>
    pids.length === 0 ? core : {...core, players: core.players.map((p) => (pids.includes(p.pid) ? {...p, nudge: p.nudge + 1} : p))};

// A commit's nudges: the players it concerns who have a row, their counts moved on in the core.
const nudged = (before: RoomCore, after: RoomCore, by: string | null, now: number): {core: RoomCore; nudge: string[]} => {
    const nudge = nudgesOf(before.state, after.state, by, now).filter((pid) => after.players.some((p) => p.pid === pid));
    return {core: withNudges(after, nudge), nudge};
};

export const planMutation = (m: MutationInput): Plan => {
    const {core, step, key, now, source} = m;
    if (key !== null && m.applied.includes(key)) return {kind: 'duplicate'};
    if (core.state.status !== 'closed' && idleCloseDue(m.lastActivityAt, now)) {
        const closed = done(idleCloseStep(core, now));
        if (closed.core === core) return {kind: 'refused', code: 'closed'};
        const n = nudged(core, closed.core, m.by, now);
        return {
            kind: 'commit', core: n.core, applied: [...m.applied], hands: closed.hands, ledgerDirty: closed.ledgerDirty, join: null, refusal: 'closed',
            visible: seenByOthers(core, closed.core), nudge: n.nudge,
        };
    }
    const clock = clockStep(source, {pid: m.by});
    const at = Math.min(m.receivedAt, now);
    const a = done(clock(core, at));
    const r = step ? step(a.core, at) : a;
    if (!r.ok) {
        const c = done(clock(core, now));
        if (c.core === core) return {kind: 'refused', code: r.code};
        const n = nudged(core, c.core, m.by, now);
        return {
            kind: 'commit', core: n.core, applied: [...m.applied], hands: c.hands, ledgerDirty: c.ledgerDirty, join: null, refusal: r.code,
            visible: seenByOthers(core, c.core), nudge: n.nudge,
        };
    }
    const b = done(clock(r.core, now));
    if (b.core === core) return {kind: 'unchanged', join: r.join};
    const n = nudged(core, b.core, m.by, now);
    return {
        kind: 'commit',
        core: n.core,
        applied: key !== null ? withApplied(m.applied, key) : [...m.applied],
        hands: [...a.hands, ...(step ? r.hands : []), ...b.hands],
        ledgerDirty: a.ledgerDirty || r.ledgerDirty || b.ledgerDirty,
        join: r.join,
        refusal: null,
        visible: seenByOthers(core, b.core),
        nudge: n.nudge,
    };
};

// The wait before retry k (0 for the first): 10·2^k ms plus up to 25 ms of jitter, so racing
// writers spread out.
export const backoffMs = (k: number, random: () => number): number => 10 * 2 ** k + Math.floor(random() * 26);
