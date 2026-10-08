// One attempt of the store's compare-and-set loop, decided: a repeat answered, not applied; an idle
// room closed instead of stepped; the clock run to the moment the request arrived before the step,
// so a move made in time beats a timeout that fell due while it waited, and on to now after it; a
// turn timed out by any other writer only after the slack, so an in-time move still on its way beats
// a tick or another player's request to the compare-and-set; a refused step whose clock still moved
// committing the clock alone, without its action id; no write when nothing changed; a write that
// only its author can see (a pre-action, leaving after the hand, a sit-out asked for mid-hand, an ask
// to see a hand and its answer, the "let others ask" setting) told apart, so the public seq never
// shows its timing, and the players it concerns but its author named, to be nudged; and the retry
// backoff.

import {describe, expect, it} from 'vitest';
import {nextDueAt} from '@/lib/poker-night/clock';
import {TIMING} from '@/lib/poker-night/config';
import {FULL_DECK} from '@/lib/poker-night/deck';
import type {JoinInput} from '@/lib/poker-night/input';
import {backoffMs, nudgesOf, planMutation, seenByOthers, type MutationInput, type Plan} from '@/lib/poker-night/mutation';
import {
    actionStep, appliedKey, clockStep, joinStep, newRoom, playerViewFor, tableStep, wireOf, type KnownIdentity, type RoomCore, type Step, type StepResult,
} from '@/lib/poker-night/room';
import type {DeckSource} from '@/lib/poker-night/types';
import {mulberry32} from '@/lib/random';
import {T0} from './fixtures';

const AV = 'v1:fox:tangerine:ring:crown';
const HOST = 'HostPid0001';
const ANA = 'AnaPid00001';
const SOURCE: DeckSource = {deck: () => [...FULL_DECK], draw: () => 0};
const guest = (id: string): KnownIdentity => ({kind: 'guest', guestId: id.padEnd(22, 'x'), issuedAt: T0});
const joinInput = (input: Partial<JoinInput> = {}): JoinInput => ({name: '', avatar: AV, as: 'player', ...input});

const okStep = (r: StepResult): Extract<StepResult, {ok: true}> => {
    if (!r.ok) throw new Error(`refused: ${r.code}`);
    return r;
};

// The host and Ana seated, the table started, the first hand dealt at `at`.
const twoSeated = (): RoomCore => {
    const core = newRoom({id: '6650a1b2c3d4e5f601234567', code: 'K7QXM4', env: 'development', host: {userId: 'u-host', pid: HOST, name: 'Hana', avatar: AV}, at: T0});
    return okStep(joinStep(joinInput({name: 'Ana'}), guest('ana'), ANA)(core, T0)).core;
};
const started = (): RoomCore => okStep(tableStep({type: 'host', by: HOST, op: {op: 'start'}})(twoSeated(), T0)).core;
const dealt = (): RoomCore => {
    const core = started();
    return okStep(clockStep(SOURCE)(core, core.state.nextHandAt!)).core;
};

const plan = (input: Partial<MutationInput> & {core: RoomCore}): Plan => planMutation({
    step: null, applied: [], key: null, by: null, lastActivityAt: T0, receivedAt: T0, now: T0, source: SOURCE, ...input,
});
const commitOf = (p: Plan): Extract<Plan, {kind: 'commit'}> => {
    if (p.kind !== 'commit') throw new Error(`no commit: ${p.kind}`);
    return p;
};

// The player on the clock, and their fold at the turn they were given.
const actorOf = (core: RoomCore): string => core.state.seats[core.state.hand!.actor!]!.pid;
const actorFolds = (core: RoomCore): Step => tableStep({type: 'act', by: actorOf(core), turn: core.state.turn, move: {kind: 'fold'}});
const actorCalls = (core: RoomCore): Step => tableStep({type: 'act', by: actorOf(core), turn: core.state.turn, move: {kind: 'call'}});

describe('a repeat', () => {
    it('is answered as a duplicate before anything runs, even with the clock due', () => {
        const core = dealt();
        const key = appliedKey(ANA, 'a-retried-action-id-0001');
        const deadline = core.state.hand!.deadline!;
        expect(plan({core, step: actorFolds(core), applied: ['x', key], key, now: deadline + 60_000})).toEqual({kind: 'duplicate'});
    });
});

describe('the clock around the step', () => {
    it('applies a move that arrived in time, though its grace ran out while it waited', () => {
        const core = dealt();
        const deadline = core.state.hand!.deadline!;
        const key = appliedKey(ANA, 'fold-in-time-000000001');
        const p = commitOf(plan({core, step: actorFolds(core), key, by: actorOf(core), receivedAt: deadline + 1000, now: deadline + TIMING.TURN_GRACE_MS + 3000}));
        expect(p.refusal).toBeNull();
        expect(p.applied).toEqual([key]);
        // Heads-up, the fold ends the hand: one summary, a fold of the player's own, not the clock's.
        expect(p.hands).toHaveLength(1);
        const fold = p.hands[0].log.find((e) => e.kind === 'fold')!;
        expect(fold.timeout).toBe(false);
        expect(p.ledgerDirty).toBe(true);
    });

    it('lets a timeout due before the move arrived win, committing the clock and refusing the move', () => {
        const core = dealt();
        const late = core.state.hand!.deadline! + TIMING.TURN_GRACE_MS + 500;
        const key = appliedKey(ANA, 'fold-too-late-00000001');
        const p = commitOf(plan({core, step: actorFolds(core), key, by: actorOf(core), applied: ['older'], receivedAt: late, now: late + 100}));
        expect(p.refusal).not.toBeNull();
        // The clock's fold is written; the late move's id is not, so the same id may try again.
        expect(p.applied).toEqual(['older']);
        expect(p.hands).toHaveLength(1);
        expect(p.hands[0].log.find((e) => e.kind === 'fold')!.timeout).toBe(true);
    });

    it('never runs the step later than now, whatever the request claims', () => {
        const core = dealt();
        const deadline = core.state.hand!.deadline!;
        const late = deadline + TIMING.TURN_GRACE_MS + 500;
        const p = commitOf(plan({core, step: actorFolds(core), by: actorOf(core), receivedAt: late + 60_000, now: late}));
        expect(p.refusal).not.toBeNull();
    });

    it('refuses with no write when the step is refused and nothing is due', () => {
        const core = dealt();
        const notTheirTurn = tableStep({type: 'act', by: 'NoSuchPid00', turn: core.state.turn, move: {kind: 'fold'}});
        expect(plan({core, step: notTheirTurn, receivedAt: core.state.hand!.startedAt, now: core.state.hand!.startedAt})).toMatchObject({kind: 'refused'});
    });

    it('runs the clock on to now after the step', () => {
        const core = started();
        const due = core.state.nextHandAt!;
        // A step that changes nothing, at a time before the deal; the deal falls due by now.
        const noop: Step = (c) => ({ok: true, core: c, hands: [], ledgerDirty: false, join: null});
        const p = commitOf(plan({core, step: noop, receivedAt: due - 10, now: due}));
        expect(p.core.state.hand?.no).toBe(1);
    });
});

describe('two writers at the turn\'s end', () => {
    // When the turn has run out by its own time: the deadline the UI counts down to, plus the grace.
    const dueOf = (core: RoomCore) => core.state.hand!.deadline! + TIMING.TURN_GRACE_MS;
    // Heads-up, the clock's fold for the actor ends the hand.
    const timedOut = (p: Extract<Plan, {kind: 'commit'}>) => p.hands.length === 1 && p.hands[0].log.some((e) => e.kind === 'fold' && e.timeout);

    it('a tick that reaches the table first leaves the turn alone until the slack is past', () => {
        const core = dealt();
        const due = dueOf(core);
        // The leader's tick, 50 ms after the turn's own time: nothing to do yet.
        expect(plan({core, receivedAt: due + 50, now: due + 50})).toEqual({kind: 'unchanged', join: null});
        // So the actor's call, which arrived 10 ms before it and lands a moment later, is applied.
        const key = appliedKey(ANA, 'call-in-time-0000000001');
        const move = commitOf(plan({core, step: actorCalls(core), key, by: actorOf(core), receivedAt: due - 10, now: due + 60}));
        expect(move.refusal).toBeNull();
        expect(move.applied).toEqual([key]);
        expect(move.core.state.turn).toBe(core.state.turn + 1);
        // Past the slack the tick times the turn out: a move still on its way by then is lost.
        const tick = commitOf(plan({core, receivedAt: due + TIMING.TIMEOUT_SLACK_MS, now: due + TIMING.TIMEOUT_SLACK_MS}));
        expect(timedOut(tick)).toBe(true);
        expect(plan({core: tick.core, step: actorCalls(core), by: actorOf(core), receivedAt: due - 10, now: due + TIMING.TIMEOUT_SLACK_MS + 10}))
            .toMatchObject({kind: 'refused'});
    });

    it('another player\'s request does not time the actor out before the slack either, and does after it', () => {
        const core = dealt();
        const due = dueOf(core);
        const other = core.state.seats.find((seat) => seat && seat.pid !== actorOf(core))!.pid;
        const sitOut = tableStep({type: 'sit-out', by: other});
        const early = commitOf(plan({core, step: sitOut, by: other, receivedAt: due + 100, now: due + 200}));
        expect(timedOut(early)).toBe(false);
        expect(early.core.state.hand!.actor).toBe(core.state.hand!.actor);
        const late = commitOf(plan({core, step: sitOut, by: other, receivedAt: due + 100, now: due + TIMING.TIMEOUT_SLACK_MS}));
        expect(timedOut(late)).toBe(true);
        // The actor's own request judges the turn by its own time: past it, they are late.
        const own = commitOf(plan({core, step: tableStep({type: 'sit-out', by: actorOf(core)}), by: actorOf(core), receivedAt: due + 100, now: due + 200}));
        expect(timedOut(own)).toBe(true);
    });

    it('arms the leader\'s tick for the slack\'s end: the mirror the views and the head carry', () => {
        const core = dealt();
        expect(nextDueAt(core.state)).toBe(dueOf(core) + TIMING.TIMEOUT_SLACK_MS);
    });
});

describe('the clock alone (a tick)', () => {
    it('writes nothing when nothing is due, and the due event when it is', () => {
        const core = started();
        const due = core.state.nextHandAt!;
        expect(plan({core, receivedAt: due - 1, now: due - 1})).toEqual({kind: 'unchanged', join: null});
        const p = commitOf(plan({core, receivedAt: due, now: due}));
        expect(p.core.state.hand?.phase).toBe('betting');
        expect(p.applied).toEqual([]);
        expect(p.refusal).toBeNull();
    });
});

describe('a step that changes nothing', () => {
    it('is unchanged, and still carries what a join found', () => {
        const core = twoSeated();
        const returning = joinStep(joinInput(), guest('ana'), 'NewPid00001');
        const p = plan({core, step: returning});
        expect(p).toEqual({kind: 'unchanged', join: {pid: ANA, outcome: 'returning', renamed: null, created: false, pruned: []}});
    });
});

describe('an idle room', () => {
    it('closes instead of running the step, calling off a live hand', () => {
        const core = dealt();
        const now = T0 + TIMING.IDLE_CLOSE_MS + 1;
        const p = commitOf(plan({core, step: actorFolds(core), key: 'k', lastActivityAt: T0, receivedAt: now, now}));
        expect(p.refusal).toBe('closed');
        expect(p.core.state.status).toBe('closed');
        expect(p.ledgerDirty).toBe(true);
        expect(p.applied).toEqual([]);
    });

    it('is left alone once closed: the step is refused with no write', () => {
        const closed = commitOf(plan({core: dealt(), lastActivityAt: T0, now: T0 + TIMING.IDLE_CLOSE_MS + 1})).core;
        const now = T0 + 2 * TIMING.IDLE_CLOSE_MS;
        expect(plan({core: closed, step: joinStep(joinInput(), guest('ben'), 'BenPid00001'), lastActivityAt: T0, receivedAt: now, now}))
            .toEqual({kind: 'refused', code: 'closed'});
    });
});

describe('who can see a write', () => {
    const extras = {realtimeOk: true, emotes: [], emoteSeq: 0, pass: null, nudge: 0};
    // The seat not on the clock heads-up, and its pre-action through the action route's step.
    const waitingOf = (core: RoomCore): string => (actorOf(core) === HOST ? ANA : HOST);
    const preStep = (pid: string, pre: {kind: 'check-fold'} | null, id: string) => ({
        step: actionStep({actionId: id, type: 'pre', pre}, pid), key: appliedKey(pid, id), by: pid,
    });

    it('keeps a pre-action set by a player not on the clock to its owner: a write, invisible to everyone else', () => {
        const core = dealt();
        const waiting = waitingOf(core);
        const p = commitOf(plan({core, ...preStep(waiting, {kind: 'check-fold'}, 'pre-set-0000000001')}));
        expect(p.visible).toBe(false);
        expect(p.refusal).toBeNull();
        expect(p.applied).toEqual([appliedKey(waiting, 'pre-set-0000000001')]);
        // At one seq and time the public table, and the actor's own view, are what they were.
        expect(wireOf(p.core, 5, T0, extras)).toEqual(wireOf(core, 5, T0, extras));
        expect(playerViewFor(p.core, actorOf(core), 5, T0, extras)).toEqual(playerViewFor(core, actorOf(core), 5, T0, extras));
        // Only the owner's view carries it.
        expect(playerViewFor(p.core, waiting, 5, T0, extras).me.pre).toEqual({kind: 'check-fold'});
        // Cleared again: as invisible.
        const cleared = commitOf(plan({core: p.core, ...preStep(waiting, null, 'pre-clear-00000001')}));
        expect(cleared.visible).toBe(false);
        expect(seenByOthers(core, cleared.core)).toBe(false);
    });

    it('shows every other write: a move, a join, a deal, a pre-action played', () => {
        const core = dealt();
        expect(commitOf(plan({core, step: actorFolds(core), by: actorOf(core)})).visible).toBe(true);
        expect(commitOf(plan({core, step: joinStep(joinInput({as: 'watcher'}), guest('ben'), 'BenPid00001')})).visible).toBe(true);
        const s = started();
        expect(commitOf(plan({core: s, now: s.state.nextHandAt!})).visible).toBe(true);
        // The waiting seat's pre-action is played the moment the actor calls: that write shows.
        const waiting = waitingOf(core);
        const set = commitOf(plan({core, ...preStep(waiting, {kind: 'check-fold'}, 'pre-set-0000000002')})).core;
        expect(commitOf(plan({core: set, step: actorCalls(set), by: actorOf(set)})).visible).toBe(true);
        expect(seenByOthers(core, core)).toBe(false);
    });

    const act = (pid: string, id: string, input: Record<string, unknown>) => ({
        step: actionStep({actionId: id, ...input} as Parameters<typeof actionStep>[0], pid), key: appliedKey(pid, id), by: pid,
    });

    it('keeps leaving after the hand, and a sit-out asked for mid-hand, to the player: nobody else is told', () => {
        const core = dealt();
        const p = commitOf(plan({core, ...act(ANA, 'leave-after-000001', {type: 'leave-after', on: true})}));
        expect(p.visible).toBe(false);
        expect(p.nudge).toEqual([]);
        expect(wireOf(p.core, 5, T0, extras)).toEqual(wireOf(core, 5, T0, extras));
        expect(playerViewFor(p.core, ANA, 5, T0, extras).me.next).toBe('leave');
        const back = commitOf(plan({core: p.core, ...act(ANA, 'leave-after-000002', {type: 'leave-after', on: false})}));
        expect(back.visible).toBe(false);
        const out = commitOf(plan({core, ...act(ANA, 'sit-out-mid-00001', {type: 'sit-out'})}));
        expect(out.visible).toBe(false);
        // The host's sit-out of Ana: hidden from the table, but Ana is nudged — her own view changed.
        const hostOut = commitOf(plan({core, ...act(HOST, 'host-sit-out-00001', {type: 'host', op: {op: 'sit-out', pid: ANA}})}));
        expect(hostOut.visible).toBe(false);
        expect(hostOut.nudge).toEqual([ANA]);
        expect(playerViewFor(hostOut.core, ANA, 5, T0, extras).me.next).toBe('sit-out');
    });

    it('keeps an ask to see a hand and its answer to their two players, nudging the other one', () => {
        let core = dealt();
        const folder = actorOf(core);
        const winner = folder === HOST ? ANA : HOST;
        core = commitOf(plan({core, step: actorFolds(core), by: folder})).core;
        const at = core.state.hand!.result!.completedAt;
        const ask = commitOf(plan({core, ...act(folder, 'ask-to-see-000001', {type: 'ask', to: winner}), receivedAt: at + 100, now: at + 100}));
        expect(ask.visible).toBe(false);
        expect(ask.nudge).toEqual([winner]);
        // The count moves on the row of the player nudged alone, and the people's version stays put.
        const counts = (c: typeof core) => Object.fromEntries(c.players.map((p) => [p.pid, p.nudge]));
        expect(counts(ask.core)).toEqual({...counts(core), [winner]: counts(core)[winner] + 1});
        expect(ask.core.peopleV).toBe(core.peopleV);
        expect(playerViewFor(ask.core, winner, 5, at + 100, extras).nudge).toBe(counts(core)[winner] + 1);
        expect(wireOf(ask.core, 5, at, extras)).toEqual(wireOf(core, 5, at, extras));
        const shown = commitOf(plan({core: ask.core, ...act(winner, 'reply-to-ask-00001', {type: 'reply', to: folder, show: 'one'}), receivedAt: at + 200, now: at + 200}));
        expect(shown.visible).toBe(false);
        expect(shown.nudge).toEqual([folder]);
        expect(counts(shown.core)).toEqual({...counts(ask.core), [folder]: counts(ask.core)[folder] + 1});
        expect(shown.hands).toHaveLength(1);
        expect(playerViewFor(shown.core, folder, 5, at + 200, extras).me.shownToMe).toHaveLength(1);
        // Shown to everyone instead: a show the table sees.
        const all = commitOf(plan({core: ask.core, ...act(winner, 'reply-to-ask-00002', {type: 'reply', to: folder, show: 'all'}), receivedAt: at + 200, now: at + 200}));
        expect(all.visible).toBe(true);
        expect(all.nudge).toEqual([folder]);
        // Turning asks off: nobody told.
        const off = commitOf(plan({core, ...act(winner, 'asks-off-00000001', {type: 'allow-asks', on: false}), receivedAt: at + 50, now: at + 50}));
        expect([off.visible, off.nudge]).toEqual([false, []]);
        expect(nudgesOf(core.state, core.state, null)).toEqual([]);
    });
});

describe('the backoff', () => {
    it('doubles from ten milliseconds, with up to 25 of jitter', () => {
        expect([0, 1, 2, 3].map((k) => backoffMs(k, () => 0))).toEqual([10, 20, 40, 80]);
        expect(backoffMs(0, () => 0.9999)).toBe(35);
        const random = mulberry32(7);
        for (let i = 0; i < 1000; i++) {
            const wait = backoffMs(2, random);
            expect(wait).toBeGreaterThanOrEqual(40);
            expect(wait).toBeLessThanOrEqual(65);
        }
    });
});
