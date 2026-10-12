// A poker night room: the engine's table plus who is at it. Pure — the store (lib/poker-night/store)
// reads a room into a RoomCore, runs one Step on it inside its compare-and-set loop, and writes the
// result back; the routes and the /play page build every view of it here.
//
// A room keeps, beside the engine's TableState:
// - players: one row per identity that joined — an account (userId) or a guest (guestId, from the
//   app's own signed cookie), never both. Its pid, 11 random characters, is the only handle that
//   leaves the server; userId and guestId never do. A seat is the engine's (state.seats), so a row
//   with no seat is a watcher.
// - bannedKeys: 'u:<userId>' or 'g:<guestId>' of everyone the host removed. Private.
// - seen: when each pid last beat (out of band: read with the room, written only by the tick route).
// - each row's nudge: how many writes by someone else changed what only that player sees (an ask to
//   see their cards, its answer, the host's sit-out). Private but for the player's own count;
//   lib/poker-night/mutation moves it, and it never moves peopleV or the public seq.
// - peopleV: the version of the people part — every row's name and look and who was removed. A
//   step bumps it exactly when that part changes, so the realtime message can leave the names out
//   and a client refetches them only when peopleV moves.
//
// A step returns the same core for a no-op, so the store can skip the write. A player's step
// refuses on a closed table; the clock's leave it as it is.

import {AVATAR_COPY} from '@/lib/learn/copy/poker-night';
import {avatarForUser, encodeAvatar, isAvatar, resolveAvatar} from '@/lib/poker-night/avatar';
import {advance, nextDueAt, type ClockWriter} from '@/lib/poker-night/clock';
import {DEFAULT_CONFIG, DEFAULT_SETTINGS, KEEP, TIMING} from '@/lib/poker-night/config';
import {createTable, forceClose, forgetSettled, reduce} from '@/lib/poker-night/engine';
import type {Env} from '@/lib/poker-night/env';
import {refusalToCode, type PokerNightErrorCode} from '@/lib/poker-night/http';
import {isRoomAction, toTableAction, type ActionInput, type JoinInput} from '@/lib/poker-night/input';
import {isSettled, ledgerRow, needsHost} from '@/lib/poker-night/ledger';
import {LIMITS} from '@/lib/poker-night/limits';
import {cleanName, cleanTableName, nameKey, uniqueName} from '@/lib/poker-night/names';
import {isLive, seatOf} from '@/lib/poker-night/seats';
import type {DeckSource, GameConfig, HandSummary, RoomSettings, TableAction, TableState} from '@/lib/poker-night/types';
import type {
    EmoteView, JoinOutcome, JoinView, People, PlayerView, PlayPageView, Presence, RoomView, ViewMeta, WireView,
} from '@/lib/poker-night/view-types';
import {clockLeaderOf, peopleView, playerView, wireView} from '@/lib/poker-night/views';
import {fnv1a} from '@/lib/random';

// ── who is asking ──

// Who a request comes from (lib/poker-night/identity.readIdentity): the account wins over a guest
// cookie; 'unavailable' is a session read that failed, never quietly a guest.
export type PlayerIdentity =
    | {kind: 'user'; userId: string; accountName: string; guestId: string | null}
    | {kind: 'guest'; guestId: string; issuedAt: number}
    | {kind: 'none'}
    | {kind: 'unavailable'};

export type KnownIdentity = Extract<PlayerIdentity, {kind: 'user' | 'guest'}>;

export const isKnown = (identity: PlayerIdentity): identity is KnownIdentity => identity.kind === 'user' || identity.kind === 'guest';

export type RoomPlayer = {
    pid: string;
    userId: string | null; // PRIVATE
    guestId: string | null; // PRIVATE
    name: string;
    avatar: string;
    joinedAt: number;
    banned: boolean;
    nudge: number; // PRIVATE but to its own player
};

export type Seen = {at: number; hidden: boolean};

export type RoomCore = {
    id: string;
    code: string;
    env: Env;
    hostUserId: string;
    state: TableState;
    players: RoomPlayer[];
    bannedKeys: string[]; // PRIVATE
    seen: Readonly<Record<string, Seen>>;
    peopleV: number;
};

// What a join did, for the route's answer and the store's housekeeping (the seen stamps of pruned
// rows can go).
export type JoinResult = {pid: string; outcome: JoinOutcome; renamed: string | null; created: boolean; pruned: string[]};

export type StepResult =
    | {ok: true; core: RoomCore; hands: HandSummary[]; ledgerDirty: boolean; join: JoinResult | null}
    | {ok: false; code: PokerNightErrorCode};

// One change to a room at time `at` (the moment the request arrived).
export type Step = (core: RoomCore, at: number) => StepResult;

// A table action before the step stamps its time.
export type UnstampedAction = TableAction extends infer T ? (T extends TableAction ? Omit<T, 'at'> : never) : never;

export const identityKey = (identity: KnownIdentity): string =>
    identity.kind === 'user' ? `u:${identity.userId}` : `g:${identity.guestId}`;

const rowKey = (p: RoomPlayer): string | null => (p.userId !== null ? `u:${p.userId}` : p.guestId !== null ? `g:${p.guestId}` : null);

// What finding a player needs of a row, and their nudge count: the store's head projection carries
// just this much.
export type PlayerKeys = Pick<RoomPlayer, 'pid' | 'userId' | 'guestId' | 'banned' | 'nudge'>;

// The row an identity plays as: an account's by its userId, a guest's by its guestId (and only a
// guest row — an account never falls back on the guest cookie it also carries).
export const playerFor = <P extends PlayerKeys>(core: {readonly players: readonly P[]}, identity: PlayerIdentity): P | null => {
    if (identity.kind === 'user') return core.players.find((p) => p.userId === identity.userId) ?? null;
    if (identity.kind === 'guest') return core.players.find((p) => p.userId === null && p.guestId === identity.guestId) ?? null;
    return null;
};

// Removed by the host: their row says so, or their key is on the list — for an account, the guest
// cookie it carries counts too, so a removed guest cannot sign up in the same browser to come back.
export const isBanned = (core: {readonly players: readonly PlayerKeys[]; readonly bannedKeys: readonly string[]}, identity: KnownIdentity): boolean => {
    if (playerFor(core, identity)?.banned) return true;
    const keys = new Set(core.bannedKeys);
    if (keys.has(identityKey(identity))) return true;
    return identity.kind === 'user' && identity.guestId !== null && keys.has(`g:${identity.guestId}`);
};

const rowOf = (core: Pick<RoomCore, 'players'>, pid: string): RoomPlayer | null => core.players.find((p) => p.pid === pid) ?? null;

// ── presence ──

const seenOf = (core: Pick<RoomCore, 'seen'>, pid: string): Seen | null =>
    Object.prototype.hasOwnProperty.call(core.seen, pid) ? core.seen[pid] : null;

// Here when a visible page beat within the online window, hidden when a hidden one did, offline
// otherwise.
export const presenceOf = (seen: Seen | null | undefined, now: number): Presence => {
    if (!seen || now - seen.at > LIMITS.onlineWindowMs) return 'offline';
    return seen.hidden ? 'hidden' : 'here';
};

// When a row was last heard from: its beat, or its join if it has not beaten since.
const lastSeen = (core: Pick<RoomCore, 'seen'>, p: RoomPlayer): number => Math.max(seenOf(core, p.pid)?.at ?? 0, p.joinedAt);

// Whether the host has gone unheard from for LIMITS.hostTakeoverMs by `at`: from then a seated account
// holder may claim the role. Nothing else changes with it — every buy but the host's still waits for
// the host's yes once the first hand is dealt, and claim-host is the way on.
const hostGone = (core: Pick<RoomCore, 'seen' | 'players' | 'state'>, at: number): boolean => {
    const host = rowOf(core, core.state.hostPid);
    return host !== null && at - lastSeen(core, host) > LIMITS.hostTakeoverMs;
};

const isWatcher = (core: Pick<RoomCore, 'state'>, p: RoomPlayer): boolean => !p.banned && seatOf(core.state, p.pid) === null;

// Watchers on the page now (the views' count).
export const watchersOf = (core: RoomCore, now: number): number =>
    core.players.filter((p) => isWatcher(core, p) && presenceOf(seenOf(core, p.pid), now) !== 'offline').length;

// Watchers heard from within the active window: what the watcher cap counts.
const activeWatchers = (core: Pick<RoomCore, 'state' | 'seen'>, players: readonly RoomPlayer[], now: number): number =>
    players.filter((p) => isWatcher(core, p) && now - lastSeen(core, p) <= LIMITS.activeWindowMs).length;

// A row the room may forget: a watcher not heard from within the active window that holds nothing —
// no seat, no ledger row, no request, not the host, not removed (a removal is kept so the host can
// let them back in, until the room needs the room: evictable, below).
const prunable = (core: Pick<RoomCore, 'state' | 'seen'>, p: RoomPlayer, now: number): boolean =>
    !p.banned && p.pid !== core.state.hostPid && seatOf(core.state, p.pid) === null && ledgerRow(core.state, p.pid) === null
    && !core.state.requests.some((r) => r.pid === p.pid) && now - lastSeen(core, p) > LIMITS.activeWindowMs;

export const pruneStale = (core: Pick<RoomCore, 'state' | 'seen' | 'players'>, now: number): RoomPlayer[] => {
    const kept = core.players.filter((p) => !prunable(core, p, now));
    return kept.length === core.players.length ? core.players : kept;
};

// A row a join may let go once the room keeps LIMITS.players rows, so people who are gone never fill
// it: a guest's (an account's row carries its night's results) that is not the host's, holds no
// seat, no request and no place in the current hand, has not been heard from within the active
// window, and whose ledger row, if it has one, is settled (ledger.isSettled: never dealt a hand,
// every chip cashed out). A removed guest's row may go too: its key stays in bannedKeys, so the
// removal holds, though the host can no longer let them back in.
const evictable = (core: Pick<RoomCore, 'state' | 'seen'>, p: RoomPlayer, now: number): boolean => {
    if (p.userId !== null || p.pid === core.state.hostPid || seatOf(core.state, p.pid) !== null) return false;
    if (core.state.requests.some((r) => r.pid === p.pid) || (core.state.hand?.seats.some((s) => s.pid === p.pid) ?? false)) return false;
    if (now - lastSeen(core, p) <= LIMITS.activeWindowMs) return false;
    const row = ledgerRow(core.state, p.pid);
    return row === null || isSettled(row);
};

// The rows a new identity's join lets go so the room keeps at most LIMITS.players rows with it:
// none while there is room, else the fewest that make room — rows not removed before removed ones,
// the longest unheard from first — or null when not enough can go (the room is full).
const toLetGo = (core: Pick<RoomCore, 'state' | 'seen'>, players: readonly RoomPlayer[], now: number): RoomPlayer[] | null => {
    const need = players.length + 1 - LIMITS.players;
    if (need <= 0) return [];
    const candidates = players.filter((p) => evictable(core, p, now))
        .sort((a, b) => Number(a.banned) - Number(b.banned) || lastSeen(core, a) - lastSeen(core, b));
    return candidates.length >= need ? candidates.slice(0, need) : null;
};

// ── results ──

const fail = (code: PokerNightErrorCode): StepResult => ({ok: false, code});

const peopleDigest = (players: readonly RoomPlayer[]): string => JSON.stringify(players.map((p) => [p.pid, p.name, p.avatar, p.banned]));

// Every step ends here: the same core for a no-op, else the new one, with peopleV moved on when the
// people part changed.
const done = (prev: RoomCore, next: RoomCore, extra: {hands?: HandSummary[]; ledgerDirty?: boolean; join?: JoinResult} = {}): StepResult => {
    const bumped = next !== prev && next.players !== prev.players && peopleDigest(next.players) !== peopleDigest(prev.players)
        ? {...next, peopleV: prev.peopleV + 1}
        : next;
    return {ok: true, core: bumped, hands: extra.hands ?? [], ledgerDirty: extra.ledgerDirty ?? false, join: extra.join ?? null};
};

// A step that refuses on a closed table before it looks at anything else.
const open = (step: Step): Step => (core, at) => (core.state.status === 'closed' ? fail('closed') : step(core, at));

// A player's step: refused on a closed table, then unless `pid` has a row in the room the step runs
// on ('not_player') that the host has not removed ('banned').
const asPlayer = (pid: string, step: Step): Step => open((core, at) => {
    const row = rowOf(core, pid);
    if (!row) return fail('not_player');
    if (row.banned) return fail('banned');
    return step(core, at);
});

// ── names ──

// The name a blank one sits as: the avatar's face, "Fox".
export const faceNameOf = (avatar: string): string => AVATAR_COPY.faces[resolveAvatar(avatar).face];

const takenKeys = (players: readonly RoomPlayer[], except: string | null): Set<string> =>
    new Set(players.filter((p) => p.pid !== except).map((p) => nameKey(p.name)));

// The name a player sits under: what they typed, cleaned, else their face's name; made unique at
// the table. renamed is set when that is not what they asked for.
const nameFor = (raw: string, avatar: string, players: readonly RoomPlayer[], except: string | null): {name: string; renamed: string | null} => {
    const asked = cleanName(raw) ?? faceNameOf(avatar);
    const name = uniqueName(asked, takenKeys(players, except));
    return {name, renamed: name === asked ? null : name};
};

// ── the engine's actions ──

// The removals the room remembers, oldest first: every kept row's key, and at most
// LIMITS.bannedKeys in all — past that, the oldest of those whose rows a join let go are forgotten.
const boundBans = (keys: readonly string[], players: readonly RoomPlayer[]): string[] => {
    let over = keys.length - LIMITS.bannedKeys;
    if (over <= 0) return [...keys];
    const held = new Set(players.map(rowKey));
    const out: string[] = [];
    for (const key of keys) {
        if (over > 0 && !held.has(key)) {
            over--;
            continue;
        }
        out.push(key);
    }
    return out;
};

// The host's removal bans the removed pid's identity; a pid with no row (never joined) bans nobody.
const banPid = (core: RoomCore, pid: string): Pick<RoomCore, 'players' | 'bannedKeys'> | null => {
    const row = rowOf(core, pid);
    if (!row) return null;
    const key = rowKey(row);
    const listed = key === null || core.bannedKeys.includes(key);
    if (row.banned && listed) return null;
    return {
        players: core.players.map((p) => (p === row ? {...p, banned: true} : p)),
        bannedKeys: listed ? core.bannedKeys : boundBans([...core.bannedKeys, key!], core.players),
    };
};

const applyTable = (core: RoomCore, action: TableAction): StepResult => {
    const r = reduce(core.state, action);
    if (!r.ok) return fail(refusalToCode(r.reason));
    const ban = r.kicked ? banPid(core, r.kicked) : null;
    if (r.state === core.state && !ban) return done(core, core);
    return done(core, {...core, state: r.state, ...(ban ?? {})}, {hands: r.hands, ledgerDirty: r.ledgerDirty});
};

// One engine action (a move, a pre-action, a seat, a buy, a host op…) at the step's time. A
// removal (host op 'kick') also bans the removed player's identity and marks their row.
export const tableStep = (action: UnstampedAction): Step => (core, at) => applyTable(core, {...action, at} as TableAction);

// Whatever the clock has made due by `at` (lib/poker-night/clock.advance), as `writer` judges a
// turn's timeout (clock.dueFor; none: the engine's own rule).
export const clockStep = (source: DeckSource, writer: ClockWriter | null = null): Step => (core, at) => {
    if (core.state.status === 'closed') return done(core, core);
    const a = advance(core.state, at, source, writer);
    return a.state === core.state ? done(core, core) : done(core, {...core, state: a.state}, {hands: a.hands, ledgerDirty: a.ledgerDirty});
};

// A room idle for TIMING.IDLE_CLOSE_MS closes on its next write: a live hand is called off and
// everyone is cashed out.
export const idleCloseDue = (lastActivityAt: number, now: number): boolean => now - lastActivityAt > TIMING.IDLE_CLOSE_MS;

export const idleCloseStep: Step = (core, at) => {
    const next = forceClose(core.state, at);
    return next === core.state ? done(core, core) : done(core, {...core, state: next}, {ledgerDirty: true});
};

// ── joining ──

const freeSeats = (state: TableState): number[] => state.seats.flatMap((seat, i) => (seat ? [] : [i]));

// The seat a join takes: the one asked for if free; else the next free one round the table (moved);
// with none asked, the first free one. null when every seat is taken.
const pickSeat = (state: TableState, asked: number | undefined): {seat: number; moved: boolean} | 'bad-seat' | null => {
    const free = freeSeats(state);
    if (asked === undefined) return free.length > 0 ? {seat: free[0], moved: false} : null;
    if (asked >= state.seats.length) return 'bad-seat';
    if (state.seats[asked] === null) return {seat: asked, moved: false};
    if (free.length === 0) return null;
    return {seat: free.find((i) => i > asked) ?? free[0], moved: true};
};

type Sat = {ok: true; core: RoomCore; hands: HandSummary[]; ledgerDirty: boolean; outcome: JoinOutcome} | {ok: false; code: PokerNightErrorCode};

// Seats an existing row: the seat chosen as above, the buy-in asked for or the table's cap, under
// the engine's rules (a returning player's re-sit is a rebuy). With every seat taken they watch.
const sitDown = (core: RoomCore, pid: string, input: JoinInput, at: number, watchersBefore: number | null): Sat => {
    const choice = pickSeat(core.state, input.seat);
    if (choice === 'bad-seat') return {ok: false, code: 'bad_seat'};
    if (choice === null) {
        if (watchersBefore !== null && watchersBefore >= LIMITS.watchers) return {ok: false, code: 'watchers_full'};
        return {ok: true, core, hands: [], ledgerDirty: false, outcome: 'full'};
    }
    const r = reduce(core.state, {type: 'sit', by: pid, seat: choice.seat, buyIn: input.buyIn ?? core.state.config.buyInMax, at});
    if (!r.ok) return {ok: false, code: refusalToCode(r.reason)};
    return {ok: true, core: {...core, state: r.state}, hands: r.hands, ledgerDirty: r.ledgerDirty, outcome: choice.moved ? 'moved' : 'seated'};
};

// POST join. Idempotent per identity: a returning player is answered as they are (a watcher asking
// to play is seated). A new identity is refused at a locked table and when the room is full; it
// gets a row (pid newPid, which the route draws), a unique name, and a seat — the one asked for,
// the next free one when that was just taken, or a place to watch when every seat is. Stale
// watcher rows are pruned first and, when the room keeps LIMITS.players rows, departed guests'
// rows that hold nothing are let go (with their settled ledger rows), so only people who are here,
// or who left something at the table, ever fill it.
export const joinStep = (input: JoinInput, identity: KnownIdentity, newPid: string): Step => open((core, at) => {
    if (isBanned(core, identity)) return fail('banned');
    const existing = playerFor(core, identity);
    if (existing) {
        const returning: JoinResult = {pid: existing.pid, outcome: 'returning', renamed: null, created: false, pruned: []};
        if (input.as === 'watcher' || seatOf(core.state, existing.pid) !== null) return done(core, core, {join: returning});
        const sat = sitDown(core, existing.pid, input, at, null);
        if (!sat.ok) return fail(sat.code);
        return done(core, sat.core, {hands: sat.hands, ledgerDirty: sat.ledgerDirty, join: {...returning, outcome: sat.outcome}});
    }
    if (core.state.settings.locked) return fail('locked');
    const stale = pruneStale(core, at);
    const letGo = toLetGo(core, stale, at);
    if (letGo === null) return fail('room_full');
    const kept = letGo.length === 0 ? stale : stale.filter((p) => !letGo.includes(p));
    // A drawn pid that is already taken (2^-64): the client's retry draws another.
    if (core.players.some((p) => p.pid === newPid)) return fail('busy');
    const avatar = isAvatar(input.avatar) ? input.avatar : encodeAvatar(avatarForUser(identityKey(identity)));
    const {name, renamed} = nameFor(input.name, avatar, kept, null);
    const row: RoomPlayer = {
        pid: newPid, userId: identity.kind === 'user' ? identity.userId : null, guestId: identity.kind === 'guest' ? identity.guestId : null,
        name, avatar, joinedAt: at, banned: false, nudge: 0,
    };
    const pruned = kept === core.players ? [] : core.players.filter((p) => !kept.includes(p)).map((p) => p.pid);
    const state = letGo.length === 0 ? core.state : forgetSettled(core.state, letGo.map((p) => p.pid));
    const joined: RoomCore = {...core, state, players: [...kept, row]};
    const watchers = activeWatchers(core, kept, at);
    const result = (outcome: JoinOutcome): JoinResult => ({pid: newPid, outcome, renamed, created: true, pruned});
    if (input.as === 'watcher') {
        if (watchers >= LIMITS.watchers) return fail('watchers_full');
        return done(core, joined, {join: result('watching')});
    }
    const sat = sitDown(joined, newPid, input, at, watchers);
    if (!sat.ok) return fail(sat.code);
    return done(core, sat.core, {hands: sat.hands, ledgerDirty: sat.ledgerDirty, join: result(sat.outcome)});
});

// ── the room's own actions ──

// A new name or look, between hands: never while a hand is in play at a table the player sits at
// (the log and the seat plates would change names mid-hand). A blank name sits as the face of the
// (new) look.
export const profileStep = (pid: string, patch: {name?: string; avatar?: string}): Step => open((core) => {
    const row = rowOf(core, pid);
    if (!row) return fail('not_player');
    if (row.banned) return fail('banned');
    if (patch.avatar !== undefined && !isAvatar(patch.avatar)) return fail('bad_request');
    if (seatOf(core.state, pid) !== null && isLive(core.state.hand)) return fail('not_now');
    const avatar = patch.avatar ?? row.avatar;
    const name = patch.name === undefined ? row.name : nameFor(patch.name, avatar, core.players, pid).name;
    if (name === row.name && avatar === row.avatar) return done(core, core);
    return done(core, {...core, players: core.players.map((p) => (p === row ? {...p, name, avatar} : p))});
});

// "Let back in": the host lifts a removal. The row stays; the player joins again like anyone
// returning.
export const unbanStep = (by: string, pid: string): Step => open((core) => {
    if (by !== core.state.hostPid) return fail('not_host');
    const row = rowOf(core, pid);
    if (!row) return done(core, core);
    const key = rowKey(row);
    if (!row.banned && (key === null || !core.bannedKeys.includes(key))) return done(core, core);
    return done(core, {
        ...core,
        players: core.players.map((p) => (p === row ? {...p, banned: false} : p)),
        bannedKeys: core.bannedKeys.filter((k) => k !== key),
    });
});

// The host role moves to `pid`: the engine's hostPid and the room's hostUserId in the same write.
const makeHost = (core: RoomCore, row: RoomPlayer): StepResult =>
    done(core, {...core, hostUserId: row.userId!, state: {...core.state, hostPid: row.pid}});

// The host hands the role to another account holder (a guest cannot take it: the lobby, the open-
// table cap and closing a table all go by account).
export const handOverStep = (by: string, pid: string): Step => open((core) => {
    if (by !== core.state.hostPid) return fail('not_host');
    const row = rowOf(core, pid);
    if (!row || row.banned) return fail('invalid_action');
    if (row.userId === null) return fail('needs_account');
    if (pid === core.state.hostPid) return done(core, core);
    return makeHost(core, row);
});

// A seated account holder takes over as host once the host has gone unseen for
// LIMITS.hostTakeoverMs (a guest cannot hold the role). Requests for chips wait for whoever holds it.
export const claimHostStep = (by: string): Step => open((core, at) => {
    const row = rowOf(core, by);
    if (!row || row.banned) return fail('not_player');
    if (by === core.state.hostPid) return done(core, core);
    if (row.userId === null) return fail('needs_account');
    if (seatOf(core.state, by) === null) return fail('not_seated');
    if (rowOf(core, core.state.hostPid) && !hostGone(core, at)) return fail('not_now');
    return makeHost(core, row);
});

// POST action's step for player `pid`: the room's own actions here, the rest to the engine. Every
// one asks for `pid`'s row in the room it runs on, not removed: the route found the player in the
// head it read, but the store runs the step on the document its compare-and-set read (or re-read on
// a retry), so a removal committed while the request was on its way still stops it — and a pid
// whose row a join let go never takes a seat nobody can reach.
export const actionStep = (input: ActionInput, pid: string): Step => {
    if (isRoomAction(input)) {
        switch (input.type) {
            case 'profile': return profileStep(pid, {name: input.name, avatar: input.avatar});
            case 'unban': return asPlayer(pid, unbanStep(pid, input.pid));
            case 'hand-over': return asPlayer(pid, handOverStep(pid, input.pid));
            default: return asPlayer(pid, claimHostStep(pid));
        }
    }
    return asPlayer(pid, (core, at) => applyTable(core, toTableAction(input, pid, at)));
};

// ── a new room ──

export type NewRoom = {
    id: string;
    code: string;
    env: Env;
    host: {userId: string; pid: string; name: string; avatar: string};
    config?: GameConfig;
    settings?: Partial<RoomSettings>;
    at: number;
};

// A table with its host seated at seat 0 with the table's cap. Throws on a config outside the
// limits (the lobby checks it first).
export const newRoom = ({id, code, env, host, config = DEFAULT_CONFIG, settings = {}, at}: NewRoom): RoomCore => {
    const state = createTable({
        hostPid: host.pid, config, settings: {...DEFAULT_SETTINGS, ...settings, name: cleanTableName(settings.name) ?? ''}, at,
    });
    const avatar = isAvatar(host.avatar) ? host.avatar : encodeAvatar(avatarForUser(host.userId));
    const {name} = nameFor(host.name, avatar, [], null);
    const row: RoomPlayer = {pid: host.pid, userId: host.userId, guestId: null, name, avatar, joinedAt: at, banned: false, nudge: 0};
    const seated = reduce(state, {type: 'sit', by: host.pid, seat: 0, buyIn: state.config.buyInMax, at});
    if (!seated.ok) throw new RangeError(`the host cannot sit: ${seated.reason}`);
    return {id, code, env, hostUserId: host.userId, state: seated.state, players: [row], bannedKeys: [], seen: {}, peopleV: 1};
};

// A pid: 8 random bytes as base64url, 11 characters. Web Crypto, so this module stays client-safe.
const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export const base64url = (bytes: Uint8Array): string => {
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
        const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
        const chars = Math.min(4, Math.ceil(((bytes.length - i) * 4) / 3));
        for (let k = 0; k < chars; k++) out += B64URL[(n >> (18 - 6 * k)) & 63];
    }
    return out;
};

export const newPid = (fill: (bytes: Uint8Array) => Uint8Array = (b) => globalThis.crypto.getRandomValues(b)): string =>
    base64url(fill(new Uint8Array(8)));

// ── the store's bookkeeping ──

// The fields the room document mirrors from its state for queries (the lobby, the open-table cap,
// the clock's cheap projection).
export const mirrorsOf = (core: RoomCore) => ({
    status: core.state.status,
    name: core.state.settings.name,
    hostUserId: core.hostUserId,
    seatCount: core.state.seats.length,
    seatsTaken: core.state.seats.filter((seat) => seat !== null).length,
    showToFriends: core.state.settings.showToFriends,
    nextDueAt: nextDueAt(core.state),
});

// How long a room is kept: TIMING.ROOM_TTL_MS past its last write, or past its close once closed.
export const expiryOf = (status: TableState['status'], now: number, closedAt: number | null): {expiresAt: number; closedAt: number | null} => {
    if (status !== 'closed') return {expiresAt: now + TIMING.ROOM_TTL_MS, closedAt: null};
    const at = closedAt ?? now;
    return {expiresAt: at + TIMING.ROOM_TTL_MS, closedAt: at};
};

// The applied ring: the last KEEP.APPLIED keys of applied actions, newest last. A key is the pid and
// the action id hashed to 64 bits (FNV-1a over the id and over it reversed, in base 36), a little
// over half the length of the id itself, which keeps the ring small in the room document. Two of
// one player's ids would have to collide in both halves for a real action to read as a repeat.
const reversed = (text: string): string => Array.from(text).reverse().join('');
export const appliedKey = (pid: string, actionId: string): string => `${pid}:${fnv1a(actionId).toString(36)}.${fnv1a(reversed(actionId)).toString(36)}`;
export const withApplied = (applied: readonly string[], key: string): string[] => [...applied.filter((k) => k !== key), key].slice(-KEEP.APPLIED);

// ── views ──

export type RoomViewMeta = {realtimeOk: boolean};
export type PlayerExtras = RoomViewMeta & {emotes: EmoteView[]; emoteSeq: number; pass: string | null; duplicate?: boolean};

const presenceMap = (core: RoomCore, now: number): Record<string, Presence> =>
    Object.fromEntries(core.players.map((p) => [p.pid, presenceOf(seenOf(core, p.pid), now)]));

const viewMeta = (core: RoomCore, seq: number, now: number, meta: RoomViewMeta): ViewMeta => {
    const presence = presenceMap(core, now);
    return {
        code: core.code, seq, serverNow: now, nextDueAt: nextDueAt(core.state), clockLeader: clockLeaderOf(core.state, presence),
        presence, watchers: watchersOf(core, now), realtimeOk: meta.realtimeOk, peopleV: core.peopleV,
    };
};

// Every row's name and look by pid, and the pids the host removed.
export const peopleOf = (core: Pick<RoomCore, 'players'>): {people: People; removed: string[]} => ({
    people: Object.fromEntries(core.players.map((p) => [p.pid, {name: p.name, avatar: p.avatar}])),
    removed: core.players.filter((p) => p.banned).map((p) => p.pid),
});

// The public table without its people: the realtime message.
export const wireOf = (core: RoomCore, seq: number, now: number, meta: RoomViewMeta): WireView => wireView(core.state, viewMeta(core, seq, now, meta));

// The public table with its people: what a viewer who has not joined sees, and the base of every
// response.
export const roomView = (core: RoomCore, seq: number, now: number, meta: RoomViewMeta): RoomView => {
    const {people, removed} = peopleOf(core);
    return {...wireOf(core, seq, now, meta), ...peopleView(people, removed)};
};

// Player `pid`'s own view: the room view plus their seat, cards and pre-action, the config, the
// emotes and their own nudge count (their row's).
export const playerViewFor = (core: RoomCore, pid: string, seq: number, now: number, extras: PlayerExtras): PlayerView => {
    const view = playerView(core.state, pid, {
        ...viewMeta(core, seq, now, extras), ...peopleOf(core),
        hasAccount: (rowOf(core, pid)?.userId ?? null) !== null, emotes: extras.emotes, emoteSeq: extras.emoteSeq, pass: extras.pass,
        nudge: rowOf(core, pid)?.nudge ?? 0,
    });
    return extras.duplicate ? {...view, duplicate: true} : view;
};

// What the join card needs for a viewer with no row (or a removed one): with it, the game the next
// hand deals and whether the chips wait for the host (the first hand has been dealt: needsHost for
// anyone but the host, who always has a row).
export const joinViewFor = (core: RoomCore, identity: PlayerIdentity, now: number): JoinView => ({
    banned: isKnown(identity) && isBanned(core, identity),
    locked: core.state.settings.locked,
    seats: core.state.seats.length,
    seatsFree: freeSeats(core.state).length,
    watchersFull: activeWatchers(core, core.players, now) >= LIMITS.watchers,
    roomFull: toLetGo(core, pruneStale(core, now), now) === null,
    buyIn: {min: core.state.config.buyInMin, max: core.state.config.buyInMax},
    hasAccount: identity.kind === 'user',
    variant: core.state.config.variant,
    boards: core.state.config.boards,
    needsApproval: needsHost(core.state, ''),
});

// The /play page's first render: a joined viewer's own view, else the public table behind the join
// card. The time is the store's read time, never the render's clock.
export const playPageView = (core: RoomCore, identity: PlayerIdentity, seq: number, serverNow: number, extras: PlayerExtras): PlayPageView => {
    const row = playerFor(core, identity);
    if (row && isKnown(identity) && !isBanned(core, identity)) return {view: playerViewFor(core, row.pid, seq, serverNow, extras)};
    return {preview: roomView(core, seq, serverNow, extras), join: joinViewFor(core, identity, serverNow)};
};
