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

import type {PokerNightErrorCode} from '@/lib/poker-night/http';
import {clockStep, idleCloseDue, idleCloseStep, withApplied, type JoinResult, type RoomCore, type Step, type StepResult} from '@/lib/poker-night/room';
import type {DeckSource, HandSummary} from '@/lib/poker-night/types';

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
    | {kind: 'commit'; core: RoomCore; applied: string[]; hands: HandSummary[]; ledgerDirty: boolean; join: JoinResult | null; refusal: PokerNightErrorCode | null};

type Done = Extract<StepResult, {ok: true}>;

// The clock's and the idle close's steps never refuse.
const done = (r: StepResult): Done => {
    if (!r.ok) throw new Error(`poker night: a clock step refused (${r.code})`);
    return r;
};

export const planMutation = (m: MutationInput): Plan => {
    const {core, step, key, now, source} = m;
    if (key !== null && m.applied.includes(key)) return {kind: 'duplicate'};
    if (core.state.status !== 'closed' && idleCloseDue(m.lastActivityAt, now)) {
        const closed = done(idleCloseStep(core, now));
        if (closed.core === core) return {kind: 'refused', code: 'closed'};
        return {kind: 'commit', core: closed.core, applied: [...m.applied], hands: closed.hands, ledgerDirty: closed.ledgerDirty, join: null, refusal: 'closed'};
    }
    const clock = clockStep(source, {pid: m.by});
    const at = Math.min(m.receivedAt, now);
    const a = done(clock(core, at));
    const r = step ? step(a.core, at) : a;
    if (!r.ok) {
        const c = done(clock(core, now));
        if (c.core === core) return {kind: 'refused', code: r.code};
        return {kind: 'commit', core: c.core, applied: [...m.applied], hands: c.hands, ledgerDirty: c.ledgerDirty, join: null, refusal: r.code};
    }
    const b = done(clock(r.core, now));
    if (b.core === core) return {kind: 'unchanged', join: r.join};
    return {
        kind: 'commit',
        core: b.core,
        applied: key !== null ? withApplied(m.applied, key) : [...m.applied],
        hands: [...a.hands, ...(step ? r.hands : []), ...b.hands],
        ledgerDirty: a.ledgerDirty || r.ledgerDirty || b.ledgerDirty,
        join: r.join,
        refusal: null,
    };
};

// The wait before retry k (0 for the first): 10·2^k ms plus up to 25 ms of jitter, so racing
// writers spread out.
export const backoffMs = (k: number, random: () => number): number => 10 * 2 ** k + Math.floor(random() * 26);
