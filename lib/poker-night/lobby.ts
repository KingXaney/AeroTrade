// The poker night lobby (/poker-night), shaped from what lib/poker-night/lobby-store reads. Pure and
// client-safe: the page renders what shapeLobby hands it, and a section with nothing in it comes
// back null, so it is not drawn (invariant 8).
//
// - Open tables: not closed, written within LIMITS.hostActiveWindowMs, and not idle past
//   TIMING.IDLE_CLOSE_MS. A table idle that long closes on its next write (room.idleCloseStep), so
//   the lobby already counts it as closed: it is never listed, and it never holds a host's place
//   under the open-table cap (store.countActiveHosted counts by the same filter).
// - Friends' tables: open tables an accepted friend chose to show (showToFriends), never the
//   reader's own.
// - Recent nights: the reader's PokerResult rows (lib/poker-night/results-store.readRecentResults),
//   less any still listed under their open tables. A night is finished once its table closed or
//   went idle (a room the TTL deletes before it closes never writes `closed`), and keeps a link to
//   its table while the room is kept (TIMING.ROOM_TTL_MS): a closed table shows its summary there.
//
// The rows a store reads carry the host's account id; the view the page gets never does.

import {HOST_COPY, LOBBY_COPY} from '@/lib/learn/copy/poker-night';
import {avatarForUser, encodeAvatar, isAvatar} from '@/lib/poker-night/avatar';
import {DEFAULT_CONFIG, TABLE_LIMITS, TIMING, type ConfigIssue} from '@/lib/poker-night/config';
import type {Env} from '@/lib/poker-night/env';
import {LIMITS} from '@/lib/poker-night/limits';
import {tablePath} from '@/lib/poker-night/links';
import {cleanName} from '@/lib/poker-night/names';
import type {RecentNight} from '@/lib/poker-night/results';
import type {GameConfig, RebuyPolicy, TableStatus} from '@/lib/poker-night/types';

// How many rows each section lists at most.
export const LOBBY_LIMITS = {open: 10, friends: 12, recent: 20} as const;

// ── what the store reads ──

// A table as the store lists it: the room document's mirrors, the hands dealt so far and the
// host's name at the table. Server-side only: it carries the host's account id.
export type LobbyRoom = {
    code: string;
    name: string;
    hostUserId: string;
    hostName: string;
    status: TableStatus;
    seats: number;
    seated: number;
    hands: number;
    lastActivityAt: number;
};

// The fields of a room document the lobby reads, and nothing private: no state but its hand
// count, no guest, and of each player only the account and the name (to find the host's).
export const LOBBY_PROJECTION = {
    _id: 0, code: 1, name: 1, hostUserId: 1, status: 1, seatCount: 1, seatsTaken: 1, lastActivityAt: 1,
    'state.handNo': 1, 'players.userId': 1, 'players.name': 1,
} as const;

export type LobbyDoc = {
    code: string;
    name?: string | null;
    hostUserId: string;
    status: TableStatus;
    seatCount?: number | null;
    seatsTaken?: number | null;
    lastActivityAt?: Date | number | string | null;
    state?: {handNo?: unknown} | null;
    players?: {userId?: string | null; name?: string | null}[] | null;
};

const whole = (value: unknown): number => (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0);

const timeOf = (value: LobbyDoc['lastActivityAt']): number => {
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? 0 : parsed;
    }
    return 0;
};

// A projected room document as the lobby lists it. The host's name is the name their row sits
// under at the table (it follows a hand-over: the row whose account is the room's host).
export const lobbyRoomFromDoc = (doc: LobbyDoc): LobbyRoom => ({
    code: doc.code,
    name: doc.name ?? '',
    hostUserId: doc.hostUserId,
    hostName: (doc.players ?? []).find((p) => p.userId === doc.hostUserId)?.name ?? '',
    status: doc.status,
    seats: whole(doc.seatCount),
    seated: whole(doc.seatsTaken),
    hands: whole(doc.state?.handNo),
    lastActivityAt: timeOf(doc.lastActivityAt),
});

// The query for a room that may still be open: not closed, written within the host window, not
// expired. The open-table cap and both lobby lists use it; shapeLobby then drops the idle ones.
export const openRoomsFilter = (env: Env, now: number) => ({
    env,
    status: {$ne: 'closed' as const},
    lastActivityAt: {$gt: new Date(now - LIMITS.hostActiveWindowMs)},
    expiresAt: {$gt: new Date(now)},
});

// ── what the page shows ──

export type LobbyTable = {
    code: string;
    name: string;
    status: TableStatus;
    seats: number;
    seated: number;
    hands: number;
    href: string;
    shareUrl: string;
};

export type FriendTable = LobbyTable & {host: string};

export type LobbyNight = {
    code: string;
    name: string;
    hands: number;
    net: number;
    finished: boolean;
    // The table's page while the room is kept (its summary once closed), else null.
    href: string | null;
};

export type LobbySections = {
    open: LobbyTable[] | null;
    friends: FriendTable[] | null;
    recent: LobbyNight[] | null;
    // Fewer open tables than LIMITS.hostOpenTables: Start a table is offered.
    canCreate: boolean;
};

// A room the lobby counts as closed: closed, or idle long enough that its next write closes it.
export const isIdle = (room: Pick<LobbyRoom, 'status' | 'lastActivityAt'>, now: number): boolean =>
    room.status !== 'closed' && now - room.lastActivityAt > TIMING.IDLE_CLOSE_MS;

export const isOpenRoom = (room: Pick<LobbyRoom, 'status' | 'lastActivityAt'>, now: number): boolean =>
    room.status !== 'closed' && !isIdle(room, now);

// A night is over once its table closed or went idle.
export const nightFinished = (night: Pick<RecentNight, 'closed' | 'lastAt'>, now: number): boolean =>
    night.closed || now - night.lastAt > TIMING.IDLE_CLOSE_MS;

const orNull = <T>(list: T[]): T[] | null => (list.length > 0 ? list : null);

// The open rooms of a list, newest first, each code once, at most `limit`.
const openOnly = (rooms: readonly LobbyRoom[], now: number, limit: number, skip: ReadonlySet<string> = new Set()): LobbyRoom[] => {
    const seen = new Set(skip);
    const out: LobbyRoom[] = [];
    for (const room of [...rooms].sort((a, b) => b.lastActivityAt - a.lastActivityAt)) {
        if (!isOpenRoom(room, now) || seen.has(room.code)) continue;
        seen.add(room.code);
        out.push(room);
        if (out.length === limit) break;
    }
    return out;
};

const tableOf = (room: LobbyRoom, shareUrl: (code: string) => string): LobbyTable => ({
    code: room.code, name: room.name, status: room.status, seats: room.seats, seated: room.seated, hands: room.hands,
    href: tablePath(room.code), shareUrl: shareUrl(room.code),
});

export type LobbyInput = {
    userId: string;
    mine: readonly LobbyRoom[];
    friends: readonly LobbyRoom[];
    results: readonly RecentNight[];
    now: number;
    shareUrl: (code: string) => string;
};

export const shapeLobby = ({userId, mine, friends, results, now, shareUrl}: LobbyInput): LobbySections => {
    const own = openOnly(mine.filter((room) => room.hostUserId === userId), now, LOBBY_LIMITS.open);
    const listed = new Set(own.map((room) => room.code));
    const theirs = openOnly(friends.filter((room) => room.hostUserId !== userId && room.hostName !== ''), now, LOBBY_LIMITS.friends, listed);
    const nights = results
        .filter((night) => !listed.has(night.code))
        .slice(0, LOBBY_LIMITS.recent)
        .map((night): LobbyNight => ({
            code: night.code,
            name: night.tableName,
            hands: night.hands,
            net: night.net,
            finished: nightFinished(night, now),
            href: now - night.lastAt < TIMING.ROOM_TTL_MS ? tablePath(night.code) : null,
        }));
    return {
        open: orNull(own.map((room) => tableOf(room, shareUrl))),
        friends: orNull(theirs.map((room) => ({...tableOf(room, shareUrl), host: room.hostName}))),
        recent: orNull(nights),
        canCreate: own.length < LIMITS.hostOpenTables,
    };
};

// ── the name and look an account sits down with ──

// What an account saved (prefs-store.getPokerNightPrefs): either part may be missing.
export type SavedProfile = {name: string | null; avatar: string | null};

export type LobbyProfile = {
    // What a new table seats the host as, and what My look starts from.
    name: string;
    avatar: string;
    saved: SavedProfile;
};

// The first word of an account's name, cleaned like any name at a table; '' when nothing is left.
export const firstNameOf = (accountName: string | null | undefined): string =>
    cleanName((accountName ?? '').trim().split(/\s+/)[0] ?? '') ?? '';

// The account's saved name and look, else its first name and the look its id rolls
// (avatar.avatarForUser: the same every time). A saved value that no longer reads is ignored.
export const profileOf = (saved: SavedProfile, accountName: string | null | undefined, userId: string): LobbyProfile => ({
    name: cleanName(saved.name) ?? firstNameOf(accountName),
    avatar: isAvatar(saved.avatar) ? saved.avatar : encodeAvatar(avatarForUser(userId)),
    saved,
});

// ── the look a browser kept ──

// The key the table keeps a browser's name and look under (shared with the table's own code).
export const ME_STORAGE_KEY = 'aero-poker-night:me';

// What a browser kept under ME_STORAGE_KEY, as far as the lobby reads it: a name and a look, each
// only when it still reads; null when there is nothing usable (absent, not JSON, neither part).
export const readStoredMe = (raw: string | null): {name: string | null; avatar: string | null} | null => {
    if (!raw) return null;
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (typeof parsed !== 'object' || parsed === null) return null;
    const value = parsed as {name?: unknown; avatar?: unknown};
    const name = cleanName(value.name);
    const avatar = isAvatar(value.avatar) ? value.avatar : null;
    return name === null && avatar === null ? null : {name, avatar};
};

// The browser's look is offered for the account only when it differs from what the account has.
export const storedDiffers = (stored: {name: string | null; avatar: string | null} | null, profile: Pick<LobbyProfile, 'name' | 'avatar'>): boolean =>
    stored !== null && ((stored.name !== null && stored.name !== profile.name) || (stored.avatar !== null && stored.avatar !== profile.avatar));

// ── the form under "Set it up first" ──

// The choices the lobby's form offers; the host drawer reaches every other value at the table.
// Each is within lib/poker-night/config's limits, and the defaults are among them.
export const BLIND_PRESETS: readonly (readonly [smallBlind: number, bigBlind: number])[] = [[5, 10], [10, 20], [25, 50], [50, 100], [100, 200], [500, 1000]];
export const CHIP_PRESETS: readonly number[] = [500, 1000, 2000, 5000, 10_000, 20_000, 50_000, 100_000];
export const SEAT_CHOICES: readonly number[] = Array.from({length: TABLE_LIMITS.seats.max - TABLE_LIMITS.seats.min + 1}, (_, i) => TABLE_LIMITS.seats.min + i);
export const TIMER_PRESETS: readonly number[] = [15, 20, 30, 45, 60, 90, 120];
export const REBUY_CHOICES: readonly RebuyPolicy[] = ['auto', 'approve', 'off'];

export type TableForm = {blinds: number; chips: number; seats: number; rebuys: RebuyPolicy; turnSeconds: number};

export const DEFAULT_FORM: Readonly<TableForm> = Object.freeze({
    blinds: BLIND_PRESETS.findIndex(([sb, bb]) => sb === DEFAULT_CONFIG.smallBlind && bb === DEFAULT_CONFIG.bigBlind),
    chips: DEFAULT_CONFIG.buyInMax,
    seats: DEFAULT_CONFIG.seats,
    rebuys: DEFAULT_CONFIG.rebuys,
    turnSeconds: DEFAULT_CONFIG.turnSeconds,
});

const blindsAt = (index: number): readonly [number, number] => BLIND_PRESETS[index] ?? BLIND_PRESETS[DEFAULT_FORM.blinds];

// The starting chips a big blind allows: at least one big blind, at most the cap (500 big blinds,
// and never past the table's absolute cap).
export const chipOptions = (bigBlind: number): number[] =>
    CHIP_PRESETS.filter((chips) => chips >= bigBlind && chips <= Math.min(TABLE_LIMITS.buyIn.bigBlinds * bigBlind, TABLE_LIMITS.buyIn.max));

// The chips the form sends: the one chosen while the blinds allow it, else the allowed one nearest it.
export const chipsFor = (form: Pick<TableForm, 'blinds' | 'chips'>): number => {
    const options = chipOptions(blindsAt(form.blinds)[1]);
    if (options.includes(form.chips)) return form.chips;
    return options.reduce((best, c) => (Math.abs(c - form.chips) < Math.abs(best - form.chips) ? c : best), options[0]);
};

// The config the form asks for: the blinds, starting chips as both ends of the range (the host can
// widen it at the table), the seats, the rebuy policy and the turn timer.
export const configFromForm = (form: TableForm): Partial<GameConfig> => {
    const [smallBlind, bigBlind] = blindsAt(form.blinds);
    const chips = chipsFor(form);
    return {seats: form.seats, smallBlind, bigBlind, buyInMin: chips, buyInMax: chips, rebuys: form.rebuys, turnSeconds: form.turnSeconds};
};

// Where a new table opens for its host: its page with the invite sheet open.
export const invitePath = (code: string): string => `${tablePath(code)}?invite=1`;

// A config the limits turn down (config.checkConfig), in the host drawer's words for the first thing
// wrong — the form checks before it sends, and the action again.
export const configIssueText = (issues: readonly ConfigIssue[]): string => {
    const key = issues[0]?.message;
    return key !== undefined && Object.prototype.hasOwnProperty.call(HOST_COPY.issues, key)
        ? HOST_COPY.issues[key as keyof typeof HOST_COPY.issues]
        : LOBBY_COPY.badConfig;
};
