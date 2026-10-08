// The room around the engine: a new table with its host seated; joining (new, idempotent, a seat
// just taken moving you on, a full table leaving you watching, locked, removed), the caps with
// stale watchers pruned, names deduped and reserved; removal banning the identity and "let back in"
// lifting it; renames only between hands; handing over and claiming the host role; peopleV moving
// exactly when the people part does; and the views — the page's preview against a player's view,
// presence from the beats, nothing private in either.

import {describe, expect, it} from 'vitest';
import {FULL_DECK} from '@/lib/poker-night/deck';
import {KEEP, TIMING} from '@/lib/poker-night/config';
import type {JoinInput} from '@/lib/poker-night/input';
import {conservation, isSettled} from '@/lib/poker-night/ledger';
import {LIMITS} from '@/lib/poker-night/limits';
import {
    actionStep, appliedKey, base64url, claimHostStep, clockStep, expiryOf, faceNameOf, handOverStep, idleCloseDue, idleCloseStep, identityKey, isBanned,
    joinStep, joinViewFor, mirrorsOf, newPid, newRoom, peopleOf, playerFor, playerViewFor, playPageView, presenceOf, profileStep, roomView, tableStep, unbanStep,
    wireOf, withApplied, type KnownIdentity, type PlayerIdentity, type RoomCore, type Step, type StepResult,
} from '@/lib/poker-night/room';
import {peopleIds} from '@/lib/poker-night/views';
import type {DeckSource, GameConfig} from '@/lib/poker-night/types';
import {DEFAULT_CONFIG} from '@/lib/poker-night/config';
import {T0} from './fixtures';

const AV = 'v1:fox:tangerine:ring:crown';
const OWL = 'v1:owl:slate:none:none';
const ROOM_ID = '6650a1b2c3d4e5f601234567';
const HOST_PID = 'HostPid0001';
const pid = (n: number) => `Pid${String(n).padStart(8, '0')}`;
const user = (id: string, guestId: string | null = null): KnownIdentity => ({kind: 'user', userId: id, accountName: id, guestId});
const guest = (id: string): KnownIdentity => ({kind: 'guest', guestId: id.padEnd(22, 'x'), issuedAt: T0});
const MINUTE = 60_000;
const SOURCE: DeckSource = {deck: () => [...FULL_DECK], draw: () => 0};

const room = (config: Partial<GameConfig> = {}, hostName = 'Hana'): RoomCore => newRoom({
    id: ROOM_ID, code: 'K7QXM4', env: 'development', host: {userId: 'u-host', pid: HOST_PID, name: hostName, avatar: AV},
    config: {...DEFAULT_CONFIG, ...config}, settings: {name: '  Friday   night '}, at: T0,
});

const okStep = (r: StepResult): Extract<StepResult, {ok: true}> => {
    if (!r.ok) throw new Error(`refused: ${r.code}`);
    return r;
};
const run = (core: RoomCore, step: Step, at = T0): RoomCore => okStep(step(core, at)).core;
const code = (r: StepResult) => (r.ok ? 'ok' : r.code);

const joinInput = (input: Partial<JoinInput> = {}): JoinInput => ({name: '', avatar: AV, as: 'player', ...input});
const join = (core: RoomCore, identity: KnownIdentity, p: string, input: Partial<JoinInput> = {}, at = T0): StepResult =>
    joinStep(joinInput(input), identity, p)(core, at);
const joined = (core: RoomCore, identity: KnownIdentity, p: string, input: Partial<JoinInput> = {}, at = T0): RoomCore =>
    okStep(join(core, identity, p, input, at)).core;

const seatOfPid = (core: RoomCore, p: string) => core.state.seats.findIndex((s) => s?.pid === p);
const hostOp = (core: RoomCore, op: Extract<Parameters<typeof tableStep>[0], {type: 'host'}>['op'], at = T0) =>
    tableStep({type: 'host', by: core.state.hostPid, op})(core, at);

// Starts the table and deals a hand among whoever is seated.
const dealHand = (core: RoomCore): {core: RoomCore; at: number} => {
    let c = okStep(hostOp(core, {op: 'start'})).core;
    const at = c.state.nextHandAt!;
    c = run(c, clockStep(SOURCE), at);
    expect(c.state.hand?.phase).toBe('betting');
    return {core: c, at};
};

describe('a new room', () => {
    it('seats its host at seat 0 with the table\'s cap, by name and look', () => {
        const core = room();
        expect(core.players).toEqual([{pid: HOST_PID, userId: 'u-host', guestId: null, name: 'Hana', avatar: AV, joinedAt: T0, banned: false, nudge: 0}]);
        expect(core.state.seats[0]).toMatchObject({pid: HOST_PID, stack: DEFAULT_CONFIG.buyInMax});
        expect(core.state.hostPid).toBe(HOST_PID);
        expect(core.hostUserId).toBe('u-host');
        expect(core.state.settings.name).toBe('Friday night');
        expect(core.state.status).toBe('open');
        expect(core.peopleV).toBe(1);
        expect(core.bannedKeys).toEqual([]);
    });

    it('names a host who leaves it blank after their face, and never as the table itself', () => {
        expect(room({}, '  ').players[0].name).toBe('Fox');
        expect(room({}, 'Host').players[0].name).toBe('Host 2');
        expect(faceNameOf(OWL)).toBe('Owl');
    });
});

describe('joining', () => {
    it('gives a new guest a row, a unique name and the first free seat', () => {
        const before = room();
        const r = okStep(join(before, guest('ana'), pid(1), {name: 'Ana'}));
        expect(r.join).toEqual({pid: pid(1), outcome: 'seated', renamed: null, created: true, pruned: []});
        const row = r.core.players.find((p) => p.pid === pid(1))!;
        expect(row).toMatchObject({userId: null, guestId: 'ana'.padEnd(22, 'x'), name: 'Ana', avatar: AV, banned: false, joinedAt: T0});
        expect(seatOfPid(r.core, pid(1))).toBe(1);
        expect(r.ledgerDirty).toBe(true);
        expect(r.core.peopleV).toBe(before.peopleV + 1);
    });

    it('answers a returning identity as it is, without a write', () => {
        const core = joined(room(), guest('ana'), pid(1), {name: 'Ana'});
        for (const input of [{name: 'Someone else'}, {as: 'watcher' as const}, {seat: 5}]) {
            const again = okStep(join(core, guest('ana'), pid(2), input));
            expect(again.core).toBe(core);
            expect(again.join).toEqual({pid: pid(1), outcome: 'returning', renamed: null, created: false, pruned: []});
        }
    });

    it('moves a player on to the next free seat when the one asked for was just taken', () => {
        let core = joined(room(), guest('ana'), pid(1), {seat: 3});
        expect(seatOfPid(core, pid(1))).toBe(3);
        const r = okStep(join(core, guest('ben'), pid(2), {seat: 3}));
        expect(r.join?.outcome).toBe('moved');
        expect(seatOfPid(r.core, pid(2))).toBe(4);
        core = r.core;
        // Round the table: the next free seat after the last one is the first free one.
        const last = okStep(join(joined(core, guest('cy'), pid(3), {seat: 7}), guest('di'), pid(4), {seat: 7}));
        expect(seatOfPid(last.core, pid(4))).toBe(1);
    });

    it('leaves a joiner watching when every seat is taken', () => {
        const core = joined(room({seats: 2}), guest('ana'), pid(1));
        const r = okStep(join(core, guest('ben'), pid(2), {name: 'Ben'}));
        expect(r.join?.outcome).toBe('full');
        expect(seatOfPid(r.core, pid(2))).toBe(-1);
        expect(r.core.players.map((p) => p.pid)).toContain(pid(2));
        expect(r.ledgerDirty).toBe(false);
    });

    it('seats a watcher who asks to play, and lets them watch by choice', () => {
        const watching = okStep(join(room(), guest('ana'), pid(1), {as: 'watcher'}));
        expect(watching.join?.outcome).toBe('watching');
        expect(seatOfPid(watching.core, pid(1))).toBe(-1);
        const r = okStep(join(watching.core, guest('ana'), pid(9), {seat: 2}));
        expect(r.join).toEqual({pid: pid(1), outcome: 'seated', renamed: null, created: false, pruned: []});
        expect(seatOfPid(r.core, pid(1))).toBe(2);
    });

    it('refuses a seat that does not exist and chips outside the table\'s range', () => {
        expect(code(join(room({seats: 4}), guest('ana'), pid(1), {seat: 6}))).toBe('bad_seat');
        expect(code(join(room({buyInMin: 1000, buyInMax: 3000}), guest('ana'), pid(1), {buyIn: 500}))).toBe('below_buy_in');
        expect(code(join(room({buyInMin: 1000, buyInMax: 3000}), guest('ana'), pid(1), {buyIn: 5000}))).toBe('over_cap');
        // No buy-in asked: the cap.
        const core = joined(room({buyInMin: 1000, buyInMax: 3000}), guest('ana'), pid(1));
        expect(core.state.seats[seatOfPid(core, pid(1))]!.stack).toBe(3000);
    });

    it('refuses a new identity at a locked table but lets a returning one sit', () => {
        let core = joined(room(), guest('ana'), pid(1), {as: 'watcher'});
        core = run(core, (c, at) => hostOp(c, {op: 'settings', patch: {locked: true}}, at));
        expect(code(join(core, guest('ben'), pid(2)))).toBe('locked');
        expect(code(join(core, guest('ana'), pid(3)))).toBe('ok');
    });

    it('treats a re-sit as a rebuy under the table\'s policy', () => {
        let core = joined(room({rebuys: 'off'}), guest('ana'), pid(1));
        core = run(core, tableStep({type: 'leave', by: pid(1)}));
        expect(code(join(core, guest('ana'), pid(1)))).toBe('rebuys_off');
    });

    it('refuses everything at a closed table', () => {
        const closed = run(room(), (c, at) => hostOp(c, {op: 'end'}, at));
        expect(closed.state.status).toBe('closed');
        expect(code(join(closed, guest('ana'), pid(1)))).toBe('closed');
        expect(code(profileStep(HOST_PID, {name: 'X'})(closed, T0))).toBe('closed');
        expect(code(unbanStep(HOST_PID, pid(1))(closed, T0))).toBe('closed');
        expect(code(tableStep({type: 'sit-out', by: HOST_PID})(closed, T0))).toBe('closed');
    });
});

describe('names at the table', () => {
    it('numbers a name someone here holds, in any disguise, and tells the joiner', () => {
        let core = joined(room(), guest('a1'), pid(1), {name: 'Ana'});
        const r = okStep(join(core, guest('a2'), pid(2), {name: 'Ana'}));
        expect(r.join?.renamed).toBe('Ana 2');
        core = r.core;
        const cyrillic = okStep(join(core, guest('a3'), pid(3), {name: 'Аna'}));
        expect(cyrillic.join?.renamed).toBe('Аna 3');
        expect(okStep(join(core, guest('h'), pid(4), {name: 'Dealer'})).join?.renamed).toBe('Dealer 2');
        expect(okStep(join(core, guest('h'), pid(4), {name: 'Hana'})).join?.renamed).toBe('Hana 2');
    });

    it('sits a blank name as the face, numbered when that face is taken', () => {
        let core = joined(room({}, 'Fox'), guest('a1'), pid(1), {name: '  ', avatar: AV});
        const row = core.players.find((p) => p.pid === pid(1))!;
        expect(row.name).toBe('Fox 2');
        core = joined(core, guest('a2'), pid(2), {name: '', avatar: OWL});
        expect(core.players.find((p) => p.pid === pid(2))!.name).toBe('Owl');
    });
});

describe('the caps', () => {
    it('keeps twelve active watchers and prunes the stale ones on a join', () => {
        let core = room();
        for (let i = 1; i <= LIMITS.watchers; i++) core = joined(core, guest(`w${i}`), pid(i), {as: 'watcher'});
        expect(code(join(core, guest('late'), pid(99), {as: 'watcher'}))).toBe('watchers_full');
        // Three minutes on with no beat, the watchers are stale: the next joiner prunes them.
        const later = T0 + 3 * MINUTE;
        const r = okStep(join(core, guest('late'), pid(99), {as: 'watcher'}, later));
        expect(r.join?.pruned).toHaveLength(LIMITS.watchers);
        expect(r.core.players.map((p) => p.pid)).toEqual([HOST_PID, pid(99)]);
        expect(r.core.peopleV).toBe(core.peopleV + 1);
    });

    it('counts a watcher who beat recently as active', () => {
        let core = room();
        for (let i = 1; i <= LIMITS.watchers; i++) core = joined(core, guest(`w${i}`), pid(i), {as: 'watcher'});
        const later = T0 + 3 * MINUTE;
        core = {...core, seen: {[pid(1)]: {at: later - 30_000, hidden: true}}};
        const r = okStep(join(core, guest('late'), pid(99), {as: 'watcher'}, later));
        expect(r.join?.pruned).toHaveLength(LIMITS.watchers - 1);
        expect(r.core.players.map((p) => p.pid)).toEqual([HOST_PID, pid(1), pid(99)]);
    });

    it('never prunes the host, a seat, a ledger row or a removal', () => {
        let core = joined(room(), guest('seated'), pid(1));
        core = joined(core, guest('left'), pid(2));
        core = run(core, tableStep({type: 'leave', by: pid(2)}));
        core = joined(core, guest('kicked'), pid(3), {as: 'watcher'});
        core = run(core, (c, at) => hostOp(c, {op: 'kick', pid: pid(3)}, at));
        const r = okStep(join(core, guest('new'), pid(4), {}, T0 + 60 * MINUTE));
        expect(r.join?.pruned).toEqual([]);
        expect(r.core.players.map((p) => p.pid)).toEqual([HOST_PID, pid(1), pid(2), pid(3), pid(4)]);
    });

    it('lets go of departed guests who hold nothing, so people who are gone never fill the room', () => {
        let core = room({seats: 9});
        // Twenty-nine guests who sat and left at once: each keeps a settled ledger row.
        for (let i = 1; i < LIMITS.players; i++) {
            core = joined(core, guest(`g${i}`), pid(i));
            core = run(core, tableStep({type: 'leave', by: pid(i)}));
        }
        expect(core.players).toHaveLength(LIMITS.players);
        expect(core.state.ledger).toHaveLength(LIMITS.players);
        // Heard from within the active window, they still count: the room is full for now.
        expect(code(join(core, guest('one-more'), pid(99), {}, T0 + MINUTE))).toBe('room_full');
        expect(joinViewFor(core, guest('one-more'), T0 + MINUTE).roomFull).toBe(true);
        // Gone for longer, the oldest unheard-from row goes to make room, its settled ledger row with it.
        const later = T0 + 6 * 60 * MINUTE;
        expect(joinViewFor(core, guest('one-more'), later).roomFull).toBe(false);
        core = {...core, seen: {[pid(1)]: {at: T0 + 5, hidden: false}}};
        const r = okStep(join(core, guest('one-more'), pid(99), {}, later));
        expect(r.join).toMatchObject({pid: pid(99), outcome: 'seated', pruned: [pid(2)]});
        expect(r.core.players).toHaveLength(LIMITS.players);
        expect(r.core.players.some((p) => p.pid === pid(2))).toBe(false);
        expect(r.core.state.ledger.some((row) => row.pid === pid(2))).toBe(false);
        expect(conservation(r.core.state).ok).toBe(true);
        expect(r.core.peopleV).toBe(core.peopleV + 1);
        // The let-go guest comes back as someone new; a returning identity is not new.
        expect(okStep(join(r.core, guest('g2'), pid(98), {}, later)).join).toMatchObject({pid: pid(98), created: true, pruned: [pid(3)]});
        expect(okStep(join(r.core, guest('g1'), pid(97), {}, later)).join).toMatchObject({pid: pid(1), outcome: 'seated', created: false});
    });

    it('lets go of removed guests too, keeping their removal, and remembers at most thirty-two removals', () => {
        let core = room({seats: 9});
        let at = T0;
        // A guest who joins and is removed, over and over, three minutes apart.
        for (let i = 1; i <= 70; i++) {
            at += 3 * MINUTE;
            core = joined(core, guest(`k${i}`), pid(i), {}, at);
            core = run(core, (c, t) => hostOp(c, {op: 'kick', pid: pid(i)}, t), at);
        }
        expect(core.players.length).toBeLessThanOrEqual(LIMITS.players);
        expect(core.state.ledger.length).toBeLessThanOrEqual(LIMITS.players);
        expect(core.bannedKeys).toHaveLength(LIMITS.bannedKeys);
        // Every kept removal's key is remembered, and the newest ones whose rows went.
        for (const p of core.players.filter((q) => q.banned)) expect(core.bannedKeys).toContain(`g:${p.guestId}`);
        expect(core.bannedKeys).toContain(`g:${'k40'.padEnd(22, 'x')}`);
        expect(core.players.some((p) => p.guestId === 'k40'.padEnd(22, 'x'))).toBe(false);
        expect(code(join(core, guest('k40'), pid(200), {}, at + 3 * MINUTE))).toBe('banned');
        // And a newcomer still finds room.
        expect(code(join(core, guest('friend'), pid(201), {}, at + 3 * MINUTE))).toBe('ok');
        expect(conservation(core.state).ok).toBe(true);
    });

    it('turns a new identity away once thirty rows hold something the night needs', () => {
        let core = room({seats: 9});
        // Account holders' rows carry their results, so they stay however long ago they left.
        for (let i = 1; i < LIMITS.players; i++) {
            core = joined(core, user(`u${i}`), pid(i));
            core = run(core, tableStep({type: 'leave', by: pid(i)}));
        }
        expect(code(join(core, guest('one-more'), pid(99), {}, T0 + 6 * 60 * MINUTE))).toBe('room_full');
        expect(joinViewFor(core, guest('one-more'), T0 + 6 * 60 * MINUTE).roomFull).toBe(true);
        // A returning identity is not new.
        expect(code(join(core, user('u1'), pid(98)))).toBe('ok');
        // A guest who was dealt in, or did not take out what they bought, holds a ledger row that stays.
        let played = joined(room({seats: 2}), guest('ana'), pid(1));
        ({core: played} = dealHand(played));
        played = run(played, tableStep({type: 'act', by: played.state.seats[played.state.hand!.actor!]!.pid, turn: played.state.turn, move: {kind: 'fold'}}), played.state.hand!.startedAt);
        played = run(played, tableStep({type: 'leave', by: pid(1)}), played.state.hand!.startedAt);
        // The rest of the room: watchers on the page now.
        const later = T0 + 6 * 60 * MINUTE;
        const watching = Array.from({length: LIMITS.players - 2}, (_, i) => ({
            pid: pid(100 + i), userId: null, guestId: `w${i}`.padEnd(22, 'x'), name: `W${i}`, avatar: AV, joinedAt: T0, banned: false, nudge: 0,
        }));
        played = {...played, players: [...played.players, ...watching], seen: Object.fromEntries(watching.map((w) => [w.pid, {at: later - 1000, hidden: false}]))};
        expect(isSettled(played.state.ledger.find((row) => row.pid === pid(1))!)).toBe(false);
        expect(code(join(played, guest('new'), pid(99), {}, later))).toBe('room_full');
    });
});

describe('removal and letting back in', () => {
    it('bans the removed identity, marks their row and refuses their return', () => {
        let core = joined(room(), guest('ana'), pid(1), {name: 'Ana'});
        const before = core;
        const r = okStep(hostOp(core, {op: 'kick', pid: pid(1)}));
        core = r.core;
        expect(core.bannedKeys).toEqual([`g:${'ana'.padEnd(22, 'x')}`]);
        expect(core.players.find((p) => p.pid === pid(1))!.banned).toBe(true);
        expect(seatOfPid(core, pid(1))).toBe(-1);
        expect(r.ledgerDirty).toBe(true);
        expect(core.peopleV).toBe(before.peopleV + 1);
        expect(peopleOf(core).removed).toEqual([pid(1)]);
        expect(code(join(core, guest('ana'), pid(2)))).toBe('banned');
        // The same browser signed in: its guest cookie is still the removed guest's.
        expect(isBanned(core, user('u-ana', 'ana'.padEnd(22, 'x')))).toBe(true);
        expect(code(join(core, user('u-ana', 'ana'.padEnd(22, 'x')), pid(2)))).toBe('banned');
        // Anyone else is welcome.
        expect(code(join(core, guest('ben'), pid(2)))).toBe('ok');
    });

    it('bans a watcher the host removes, though the table itself does not change', () => {
        const core = joined(room(), user('u-w'), pid(1), {as: 'watcher'});
        const r = okStep(hostOp(core, {op: 'kick', pid: pid(1)}));
        expect(r.core.state).toBe(core.state);
        expect(r.core).not.toBe(core);
        expect(r.core.bannedKeys).toEqual(['u:u-w']);
        // Removing them again changes nothing.
        expect(okStep(hostOp(r.core, {op: 'kick', pid: pid(1)})).core).toBe(r.core);
    });

    it('removes a dealt player at the end of the hand and bans them at once', () => {
        let core = joined(room(), guest('ana'), pid(1));
        ({core} = dealHand(core));
        const r = okStep(hostOp(core, {op: 'kick', pid: pid(1)}, core.state.hand!.startedAt));
        expect(r.core.bannedKeys).toHaveLength(1);
        // Facing the big blind, they fold at once, which ends the hand and empties their seat.
        expect(seatOfPid(r.core, pid(1))).toBe(-1);
        expect(r.core.state.hand!.phase).toBe('complete');
        expect(r.hands).toHaveLength(1);
    });

    it('lets the removed player back in on the host\'s word only', () => {
        let core = joined(room(), guest('ana'), pid(1));
        core = run(core, (c, at) => hostOp(c, {op: 'kick', pid: pid(1)}, at));
        expect(code(unbanStep(pid(1), pid(1))(core, T0))).toBe('not_host');
        const r = okStep(unbanStep(HOST_PID, pid(1))(core, T0));
        expect(r.core.bannedKeys).toEqual([]);
        expect(r.core.players.find((p) => p.pid === pid(1))!.banned).toBe(false);
        expect(r.core.peopleV).toBe(core.peopleV + 1);
        // They come back as the player they were: the same pid, a re-sit (a rebuy).
        const back = okStep(join(r.core, guest('ana'), pid(7)));
        expect(back.join).toMatchObject({pid: pid(1), outcome: 'seated', created: false});
        // Letting in someone not removed, or nobody, changes nothing.
        expect(okStep(unbanStep(HOST_PID, pid(1))(back.core, T0)).core).toBe(back.core);
        expect(okStep(unbanStep(HOST_PID, 'NoSuchPid00')(back.core, T0)).core).toBe(back.core);
    });
});

describe('profiles', () => {
    it('renames and changes the look between hands, deduped, and moves peopleV', () => {
        let core = joined(room(), guest('ana'), pid(1), {name: 'Ana'});
        const r = okStep(profileStep(pid(1), {name: 'Hana', avatar: OWL})(core, T0));
        const row = r.core.players.find((p) => p.pid === pid(1))!;
        expect(row).toMatchObject({name: 'Hana 2', avatar: OWL});
        expect(r.core.peopleV).toBe(core.peopleV + 1);
        core = r.core;
        // A blank name sits as the face of the new look.
        expect(run(core, profileStep(pid(1), {name: ''})).players.find((p) => p.pid === pid(1))!.name).toBe('Owl');
        // Nothing new: no write.
        expect(okStep(profileStep(pid(1), {name: 'Hana 2'})(core, T0)).core).toBe(core);
        expect(code(profileStep(pid(1), {avatar: 'v1:wolf:x:y:z'})(core, T0))).toBe('bad_request');
        expect(code(profileStep('NoSuchPid00', {name: 'X'})(core, T0))).toBe('not_player');
    });

    it('refuses a rename while the player is dealt into a live hand, but not a watcher\'s', () => {
        let core = joined(room(), guest('ana'), pid(1), {name: 'Ana'});
        core = joined(core, guest('wes'), pid(2), {as: 'watcher', name: 'Wes'});
        ({core} = dealHand(core));
        expect(code(profileStep(pid(1), {name: 'Anna'})(core, T0))).toBe('not_now');
        expect(code(profileStep(HOST_PID, {avatar: OWL})(core, T0))).toBe('not_now');
        expect(code(profileStep(pid(2), {name: 'West'})(core, T0))).toBe('ok');
    });
});

describe('the host role', () => {
    it('hands over to an account holder only, hostPid and hostUserId together', () => {
        let core = joined(room(), guest('ana'), pid(1));
        core = joined(core, user('u-ben'), pid(2));
        expect(code(handOverStep(HOST_PID, pid(1))(core, T0))).toBe('needs_account');
        expect(code(handOverStep(pid(2), pid(2))(core, T0))).toBe('not_host');
        expect(code(handOverStep(HOST_PID, 'NoSuchPid00')(core, T0))).toBe('invalid_action');
        const r = okStep(handOverStep(HOST_PID, pid(2))(core, T0));
        expect(r.core.state.hostPid).toBe(pid(2));
        expect(r.core.hostUserId).toBe('u-ben');
        // The engine sees the new host at once.
        expect(code(tableStep({type: 'host', by: pid(2), op: {op: 'start'}})(r.core, T0))).toBe('ok');
        expect(code(tableStep({type: 'host', by: HOST_PID, op: {op: 'start'}})(r.core, T0))).toBe('not_host');
        expect(okStep(handOverStep(pid(2), pid(2))(r.core, T0)).core).toBe(r.core);
    });

    it('lets a seated account holder claim it once the host is unseen for ten minutes', () => {
        let core = joined(room(), guest('ana'), pid(1));
        core = joined(core, user('u-ben'), pid(2));
        core = joined(core, user('u-cy'), pid(3), {as: 'watcher'});
        const soon = T0 + 5 * MINUTE;
        const late = T0 + LIMITS.hostTakeoverMs + 1000;
        expect(code(claimHostStep(pid(1))(core, late))).toBe('needs_account');
        expect(code(claimHostStep(pid(3))(core, late))).toBe('not_seated');
        expect(code(claimHostStep(pid(2))(core, soon))).toBe('not_now');
        // A beat from the host keeps the role theirs.
        const seen = {...core, seen: {[HOST_PID]: {at: late - MINUTE, hidden: true}}};
        expect(code(claimHostStep(pid(2))(seen, late))).toBe('not_now');
        const r = okStep(claimHostStep(pid(2))(core, late));
        expect([r.core.state.hostPid, r.core.hostUserId]).toEqual([pid(2), 'u-ben']);
        expect(okStep(claimHostStep(pid(2))(r.core, late)).core).toBe(r.core);
    });
});

describe('peopleV', () => {
    it('stays put through the table\'s own changes', () => {
        let core = joined(room(), guest('ana'), pid(1));
        const v = core.peopleV;
        core = run(core, tableStep({type: 'sit-out', by: pid(1)}));
        core = run(core, tableStep({type: 'sit-in', by: pid(1)}));
        core = run(core, (c, at) => hostOp(c, {op: 'settings', patch: {felt: 'teal'}}, at));
        ({core} = dealHand(core));
        expect(core.peopleV).toBe(v);
        // A returning join and a no-op rename leave it too.
        expect(okStep(join(core, guest('ana'), pid(5))).core.peopleV).toBe(v);
    });
});

describe('the clock and the room\'s life', () => {
    it('advances what is due and hands back the same room when nothing is', () => {
        const core = joined(room(), guest('ana'), pid(1));
        expect(okStep(clockStep(SOURCE)(core, T0)).core).toBe(core);
        const started = run(core, (c, at) => hostOp(c, {op: 'start'}, at));
        expect(okStep(clockStep(SOURCE)(started, started.state.nextHandAt! - 1)).core).toBe(started);
        const dealt = okStep(clockStep(SOURCE)(started, started.state.nextHandAt!));
        expect(dealt.core.state.hand?.no).toBe(1);
        expect(dealt.core.peopleV).toBe(started.peopleV);
    });

    it('closes a room idle for twelve hours, calling off a live hand', () => {
        const {core, at} = dealHand(joined(room(), guest('ana'), pid(1)));
        expect(idleCloseDue(at, at + TIMING.IDLE_CLOSE_MS)).toBe(false);
        expect(idleCloseDue(at, at + TIMING.IDLE_CLOSE_MS + 1)).toBe(true);
        const r = okStep(idleCloseStep(core, at + TIMING.IDLE_CLOSE_MS + 1));
        expect(r.core.state.status).toBe('closed');
        expect(r.ledgerDirty).toBe(true);
        expect(okStep(idleCloseStep(r.core, at)).core).toBe(r.core);
    });

    it('mirrors the state for the store\'s queries and keeps a closed room a week', () => {
        const core = joined(room(), guest('ana'), pid(1));
        expect(mirrorsOf(core)).toEqual({status: 'open', name: 'Friday night', hostUserId: 'u-host', seatCount: 8, seatsTaken: 2, showToFriends: false, nextDueAt: null});
        expect(expiryOf('playing', T0, null)).toEqual({expiresAt: T0 + TIMING.ROOM_TTL_MS, closedAt: null});
        expect(expiryOf('closed', T0 + 5, null)).toEqual({expiresAt: T0 + 5 + TIMING.ROOM_TTL_MS, closedAt: T0 + 5});
        expect(expiryOf('closed', T0 + 99, T0)).toEqual({expiresAt: T0 + TIMING.ROOM_TTL_MS, closedAt: T0});
    });

    it('keeps the last KEEP.APPLIED (40) applied action ids, each once', () => {
        const key = (i: number) => appliedKey(pid(1), `0b7c1e2a-9f3d-4c5b-8a6e-${String(i).padStart(12, '0')}`);
        let applied: string[] = [];
        for (let i = 0; i < 100; i++) applied = withApplied(applied, key(i));
        expect(applied).toHaveLength(KEEP.APPLIED);
        expect(KEEP.APPLIED).toBe(40);
        expect(applied[0]).toBe(key(60));
        applied = withApplied(applied, key(70));
        expect(applied).toHaveLength(KEEP.APPLIED);
        expect(applied.at(-1)).toBe(key(70));
        expect(new Set(applied).size).toBe(applied.length);
    });

    it('keys an applied action by its player and its id, shorter than the id', () => {
        const id = crypto.randomUUID();
        const key = appliedKey(pid(1), id);
        expect(key).toMatch(new RegExp(`^${pid(1)}:[0-9a-z]{1,7}\\.[0-9a-z]{1,7}$`));
        expect(key.length).toBeLessThan(`${pid(1)}:${id}`.length);
        expect(appliedKey(pid(1), id)).toBe(key);
        expect(appliedKey(pid(2), id)).not.toBe(key);
        // Ten thousand ids, no two keys alike.
        const keys = new Set(Array.from({length: 10_000}, (_, i) => appliedKey(pid(1), `action-id-${i}-xxxxxxx`)));
        expect(keys.size).toBe(10_000);
    });
});

describe('actionStep', () => {
    it('sends the room\'s own actions to their steps and the rest to the engine, stamped with the step\'s time', () => {
        let core = joined(room(), guest('ana'), pid(1), {name: 'Ana'});
        core = joined(core, user('u-ben'), pid(2));
        const id = 'a1B2c3D4e5F6g7H8';
        core = run(core, actionStep({actionId: id, type: 'profile', name: 'Anya'}, pid(1)));
        expect(core.players.find((p) => p.pid === pid(1))!.name).toBe('Anya');
        core = run(core, actionStep({actionId: id, type: 'host', op: {op: 'kick', pid: pid(1)}}, HOST_PID));
        core = run(core, actionStep({actionId: id, type: 'unban', pid: pid(1)}, HOST_PID));
        expect(core.bannedKeys).toEqual([]);
        core = run(core, actionStep({actionId: id, type: 'hand-over', pid: pid(2)}, HOST_PID));
        expect(core.hostUserId).toBe('u-ben');
        const r = okStep(actionStep({actionId: id, type: 'sit-out'}, pid(2))(core, T0 + 777));
        expect(r.core.state.seats[seatOfPid(r.core, pid(2))]!.sittingOut).toBe(true);
        expect(code(actionStep({actionId: id, type: 'buy', amount: 1}, pid(2))(core, T0))).toBe('over_cap');
        // The old host is seated with an account, but the new one was here a moment ago.
        expect(code(actionStep({actionId: id, type: 'claim-host'}, HOST_PID)(core, T0))).toBe('not_now');
        expect(code(actionStep({actionId: id, type: 'claim-host'}, HOST_PID)(core, T0 + LIMITS.hostTakeoverMs + 1))).toBe('ok');
    });

    it('refuses a player the room it runs on has removed or has no row for, whatever the route read before', () => {
        const id = 'a1B2c3D4e5F6g7H8';
        // C sat, then the host's removal committed while C's requests were on their way.
        let core = joined(room(), guest('cleo'), pid(1), {name: 'Cleo'});
        core = run(core, actionStep({actionId: id, type: 'host', op: {op: 'kick', pid: pid(1)}}, HOST_PID));
        const moves = [
            {actionId: id, type: 'sit', seat: 3, buyIn: 2000},
            {actionId: id, type: 'buy', amount: 100},
            {actionId: id, type: 'pre', pre: {kind: 'check-fold'}},
            {actionId: id, type: 'sit-in'},
            {actionId: id, type: 'show'},
            {actionId: id, type: 'unban', pid: pid(1)},
            {actionId: id, type: 'profile', name: 'Back'},
            {actionId: id, type: 'claim-host'},
        ] as const;
        for (const move of moves) expect(code(actionStep(move, pid(1))(core, T0)), move.type).toBe('banned');
        expect(core.state.seats.some((s) => s?.pid === pid(1))).toBe(false);
        // A pid with no row at all — one a join let go, or never one — takes no seat nobody could reach.
        for (const move of moves) expect(code(actionStep(move, 'NoRowPid001')(core, T0)), move.type).toBe('not_player');
        // Let back in, C may sit again.
        core = run(core, actionStep({actionId: id, type: 'unban', pid: pid(1)}, HOST_PID));
        expect(seatOfPid(run(core, actionStep(moves[0], pid(1))), pid(1))).toBe(3);
        // A closed table answers closed first.
        const closed = run(core, actionStep({actionId: id, type: 'host', op: {op: 'end'}}, HOST_PID));
        expect(code(actionStep(moves[0], 'NoRowPid001')(closed, T0))).toBe('closed');
    });
});

describe('who is asking', () => {
    it('keys an identity by its account or its guest id', () => {
        expect(identityKey(user('u1'))).toBe('u:u1');
        expect(identityKey(guest('g'))).toBe(`g:${'g'.padEnd(22, 'x')}`);
    });

    it('finds an account\'s row by its account, never by the guest cookie it also carries', () => {
        const core = joined(room(), guest('ana'), pid(1));
        expect(playerFor(core, guest('ana'))?.pid).toBe(pid(1));
        expect(playerFor(core, user('u-ana', 'ana'.padEnd(22, 'x')))).toBeNull();
        expect(playerFor(core, user('u-host'))?.pid).toBe(HOST_PID);
        expect(playerFor(core, {kind: 'none'})).toBeNull();
        expect(playerFor(core, {kind: 'unavailable'})).toBeNull();
    });

    it('draws an 11-character base64url pid', () => {
        for (let i = 0; i < 100; i++) expect(newPid()).toMatch(/^[A-Za-z0-9_-]{11}$/);
        const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254]);
        expect(newPid(() => bytes)).toBe(Buffer.from(bytes).toString('base64url'));
        for (let n = 0; n < 12; n++) {
            const b = Uint8Array.from({length: n}, (_, i) => (i * 97 + 13) % 256);
            expect(base64url(b)).toBe(Buffer.from(b).toString('base64url'));
        }
    });
});

describe('presence', () => {
    it('reads a beat as here, hidden or offline', () => {
        expect(presenceOf({at: T0, hidden: false}, T0 + 30_000)).toBe('here');
        expect(presenceOf({at: T0, hidden: true}, T0 + 30_000)).toBe('hidden');
        expect(presenceOf({at: T0, hidden: false}, T0 + LIMITS.onlineWindowMs + 1)).toBe('offline');
        expect(presenceOf(undefined, T0)).toBe('offline');
        expect(presenceOf(null, T0)).toBe('offline');
    });
});

describe('the views', () => {
    const setUp = () => {
        let core = joined(room(), guest('ana'), pid(1), {name: 'Ana'});
        core = joined(core, user('u-ben'), pid(2), {name: 'Ben', avatar: OWL});
        core = joined(core, guest('wes'), pid(3), {as: 'watcher', name: 'Wes'});
        core = joined(core, guest('kim'), pid(4), {as: 'watcher', name: 'Kim'});
        core = run(core, (c, at) => hostOp(c, {op: 'kick', pid: pid(4)}, at));
        const now = T0 + 10_000;
        core = {...core, seen: {[pid(1)]: {at: now, hidden: false}, [pid(2)]: {at: now, hidden: true}, [pid(3)]: {at: now - 1000, hidden: false}, constructor: {at: now, hidden: false}}};
        return {core: dealHand(core).core, now};
    };

    const keysIn = (value: unknown, out = new Set<string>()): Set<string> => {
        if (Array.isArray(value)) value.forEach((v) => keysIn(v, out));
        else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) {
            out.add(k);
            keysIn(v, out);
        }
        return out;
    };
    const PRIVATE = ['deck', 'userId', 'guestId', 'bannedKeys', 'applied', 'seen', 'hostUserId', 'atBet'];

    it('carry the people beside the wire view, and leave them off the wire', () => {
        const {core, now} = setUp();
        const view = roomView(core, 41, now, {realtimeOk: true});
        expect(view.peopleV).toBe(core.peopleV);
        expect(Object.keys(view.people).sort()).toEqual(core.players.map((p) => p.pid).sort());
        expect(view.people[pid(2)]).toEqual({name: 'Ben', avatar: OWL});
        for (const p of peopleIds(core.state)) expect(view.people[p], p).toBeDefined();
        expect(view.removed).toEqual([pid(4)]);
        const wire = wireOf(core, 41, now, {realtimeOk: true});
        expect(Object.keys(wire)).not.toContain('people');
        expect(Object.keys(wire)).not.toContain('removed');
        const {people, removed, ...rest} = view;
        expect([people, removed].every(Boolean)).toBe(true);
        expect(rest).toEqual(wire);
    });

    it('read presence from the beats, lead the clock from the lowest seat here, and count watchers on the page', () => {
        const {core, now} = setUp();
        const view = roomView(core, 41, now, {realtimeOk: false});
        expect(view.seats[1]?.presence).toBe('here');
        expect(view.seats[2]?.presence).toBe('hidden');
        expect(view.seats[0]?.presence).toBe('offline');
        expect(view.clockLeader).toBe(pid(1));
        // Wes is on the page; Kim was removed.
        expect(view.watchers).toBe(1);
        expect(view.realtimeOk).toBe(false);
        expect([view.seq, view.serverNow, view.code]).toEqual([41, now, 'K7QXM4']);
        expect(view.nextDueAt).toBe(core.state.hand!.deadline! + TIMING.TURN_GRACE_MS + TIMING.TIMEOUT_SLACK_MS);
    });

    it('give a player their own cards and account flag, and nothing private to anyone', () => {
        const {core, now} = setUp();
        const nudged = {...core, players: core.players.map((p) => (p.pid === pid(2) ? {...p, nudge: 2} : p))};
        const ben = playerViewFor(nudged, pid(2), 41, now, {realtimeOk: true, emotes: [], emoteSeq: 0, pass: 'p', duplicate: true});
        expect(ben.me).toMatchObject({pid: pid(2), seat: 2, role: 'seated', isHost: false, hasAccount: true});
        expect(ben.me.hole).toHaveLength(2);
        expect(ben.duplicate).toBe(true);
        expect(ben.pass).toBe('p');
        expect(ben.nudge).toBe(2);
        const ana = playerViewFor(nudged, pid(1), 41, now, {realtimeOk: true, emotes: [], emoteSeq: 0, pass: null});
        expect(ana.nudge).toBe(0);
        expect(ana.me.hasAccount).toBe(false);
        expect('duplicate' in ana).toBe(false);
        for (const view of [ben, ana, roomView(core, 41, now, {realtimeOk: true})]) {
            const keys = keysIn(view);
            for (const key of PRIVATE) expect(keys.has(key), key).toBe(false);
            const json = JSON.stringify(view);
            expect(json).not.toContain('u-ben');
            expect(json).not.toContain('u-host');
            expect(json).not.toContain('ana'.padEnd(22, 'x'));
        }
        // Another player's cards are never in Ana's view.
        expect(ana.seats[2]!.cards).toBe(2);
        expect(ana.me.hole).not.toEqual(ben.me.hole);
    });

    it('show a joined viewer their own view on the page, and anyone else the table behind the join card', () => {
        const {core, now} = setUp();
        const extras = {realtimeOk: true, emotes: [], emoteSeq: 0, pass: null};
        const own = playPageView({...core, players: core.players.map((p) => (p.pid === pid(1) ? {...p, nudge: 5} : p))}, guest('ana'), 41, now, extras);
        expect('view' in own && own.view.me.pid).toBe(pid(1));
        expect('view' in own && own.view.nudge).toBe(5);
        const watcher = playPageView(core, guest('wes'), 41, now, extras);
        expect('view' in watcher && watcher.view.me.role).toBe('watching');
        const identities: PlayerIdentity[] = [guest('stranger'), {kind: 'none'}, user('u-new'), guest('kim')];
        for (const identity of identities) {
            const page = playPageView(core, identity, 41, now, extras);
            expect('preview' in page).toBe(true);
            if (!('preview' in page)) continue;
            expect(keysIn(page).has('me')).toBe(false);
            expect(keysIn(page).has('hole')).toBe(false);
            expect(page.preview.people[pid(1)].name).toBe('Ana');
            expect(page.join).toEqual({
                banned: identity.kind === 'guest' && identity.guestId.startsWith('kim'), locked: false, seats: 8, seatsFree: 5,
                watchersFull: false, roomFull: false, buyIn: {min: DEFAULT_CONFIG.buyInMin, max: DEFAULT_CONFIG.buyInMax}, hasAccount: identity.kind === 'user',
                variant: 'holdem', boards: 1, needsApproval: core.state.handNo > 0,
            });
        }
    });
});
