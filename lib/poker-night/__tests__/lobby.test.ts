// The lobby's shaping: a section with nothing in it comes back null; an idle or closed table is
// never listed open and never holds a place under the open-table cap; friends' tables leave out
// the reader's own; a night is finished once closed or idle and links to its table while the room
// is kept; the rows the page gets carry no account id. Also the name and look an account starts
// from, and what the lobby reads of the look a browser kept.

import {describe, expect, it} from 'vitest';
import {HOST_COPY, LOBBY_COPY, MODE_COPY, POKER_NIGHT_COPY} from '@/lib/learn/copy/poker-night';
import {avatarForUser, encodeAvatar} from '@/lib/poker-night/avatar';
import {checkConfig, DEFAULT_CONFIG, mergeConfig, TIMING} from '@/lib/poker-night/config';
import {LIMITS} from '@/lib/poker-night/limits';
import {DEFAULT_PERSONAL_LOOK} from '@/lib/poker-night/personal';
import {
    BLIND_PRESETS, boardChoices, CHIP_PRESETS, chipOptions, chipsFor, configFromForm, configIssueText, DEFAULT_FORM, firstNameOf, holdsSeat, HOME_LIMITS,
    GAME_CHOICES, homeChipOf, homePokerNight, invitePath, isIdle, isOpenRoom, LOBBY_LIMITS, LOBBY_PROJECTION, lobbyRoomFromDoc, nightFinished, openRoomsFilter, profileOf,
    readStoredMe, REBUY_CHOICES, resumeOf, SEAT_CHOICES, SEATED_PROJECTION, shapeLobby, storedDiffers, modeLine, tableLine, TIMER_PRESETS,
    type LobbyDoc, type LobbyRoom, type TableLink,
} from '@/lib/poker-night/lobby';
import type {RecentNight} from '@/lib/poker-night/results';

const NOW = Date.UTC(2026, 9, 6, 20, 0, 0);
const MIN = 60_000;
const HOUR = 60 * MIN;
const ME = 'user-me';
const FRIEND = 'user-friend';
const share = (code: string) => `https://example.test/play/${code}`;

const room = (code: string, over: Partial<LobbyRoom> = {}): LobbyRoom => ({
    code, name: '', hostUserId: ME, hostName: 'Ana', status: 'open', seats: 8, seated: 1, hands: 0, variant: 'holdem', boards: 1, lastActivityAt: NOW - MIN, ...over,
});

const night = (code: string, over: Partial<RecentNight> = {}): RecentNight => ({
    roomId: `room-${code}`, code, tableName: '', bought: 2000, cashedOut: 0, chips: 2000, net: 0, hands: 3, wins: 1, biggestWin: 40,
    closed: true, firstAt: NOW - 3 * HOUR, lastAt: NOW - 2 * HOUR, ...over,
});

const shape = (input: Partial<Parameters<typeof shapeLobby>[0]> = {}) =>
    shapeLobby({userId: ME, mine: [], friends: [], results: [], now: NOW, shareUrl: share, ...input});

describe('shapeLobby', () => {
    it('hides every section with nothing in it', () => {
        expect(shape()).toEqual({resume: null, open: null, friends: null, recent: null, canCreate: true});
    });

    it('lists the reader\'s open tables newest first, with their page and share link', () => {
        const view = shape({mine: [room('AAAAAA', {lastActivityAt: NOW - 5 * MIN}), room('BBBBBB', {name: 'Friday', seated: 3, hands: 12})]});
        expect(view.open).toEqual([
            {code: 'BBBBBB', name: 'Friday', status: 'open', seats: 8, seated: 3, hands: 12, variant: 'holdem', boards: 1, href: '/play/BBBBBB', shareUrl: share('BBBBBB')},
            {code: 'AAAAAA', name: '', status: 'open', seats: 8, seated: 1, hands: 0, variant: 'holdem', boards: 1, href: '/play/AAAAAA', shareUrl: share('AAAAAA')},
        ]);
        expect(view.canCreate).toBe(true);
    });

    it('counts a closed or idle table as closed: never listed, never under the cap', () => {
        const idle = room('IDLEAA', {status: 'playing', lastActivityAt: NOW - TIMING.IDLE_CLOSE_MS - 1});
        const closed = room('CLOSED', {status: 'closed'});
        const view = shape({mine: [idle, closed, room('LIVEAA', {status: 'paused'})]});
        expect(view.open?.map((t) => t.code)).toEqual(['LIVEAA']);
        expect(isIdle(idle, NOW)).toBe(true);
        expect(isOpenRoom(idle, NOW)).toBe(false);
        expect(isOpenRoom(closed, NOW)).toBe(false);
        // Just inside the window it is still open.
        expect(isOpenRoom(room('EDGEAA', {lastActivityAt: NOW - TIMING.IDLE_CLOSE_MS}), NOW)).toBe(true);
    });

    it('offers a new table only below the open-table cap', () => {
        const mine = Array.from({length: LIMITS.hostOpenTables}, (_, i) => room(`TABLE${i}`));
        expect(shape({mine}).canCreate).toBe(false);
        expect(shape({mine: mine.slice(1)}).canCreate).toBe(true);
        // Idle ones hold no place.
        const stale = mine.map((r) => ({...r, lastActivityAt: NOW - TIMING.IDLE_CLOSE_MS - 1}));
        expect(shape({mine: stale}).canCreate).toBe(true);
    });

    it('lists only the tables the reader hosts as theirs (a hand-over moves a table away)', () => {
        const view = shape({mine: [room('MINEAA'), room('GIVENA', {hostUserId: FRIEND})]});
        expect(view.open?.map((t) => t.code)).toEqual(['MINEAA']);
    });

    it('lists friends\' tables with their host\'s name, never the reader\'s own or one listed already', () => {
        const view = shape({
            mine: [room('MINEAA')],
            friends: [
                room('FRNDAA', {hostUserId: FRIEND, hostName: 'Ben', seated: 4}),
                room('MINEAA', {hostUserId: FRIEND, hostName: 'Ben'}),
                room('SELFAA', {hostUserId: ME}),
                room('NONAME', {hostUserId: FRIEND, hostName: ''}),
                room('GONEAA', {hostUserId: FRIEND, hostName: 'Ben', status: 'closed'}),
            ],
        });
        expect(view.friends).toEqual([{
            code: 'FRNDAA', name: '', status: 'open', seats: 8, seated: 4, hands: 0, variant: 'holdem', boards: 1, href: '/play/FRNDAA', shareUrl: share('FRNDAA'), host: 'Ben',
        }]);
    });

    it('lists each code once and caps every section', () => {
        const many = Array.from({length: 40}, (_, i) => room(`T${String(i).padStart(5, '0')}`, {hostUserId: FRIEND, lastActivityAt: NOW - i * MIN}));
        const view = shape({mine: [room('DUPAAA'), room('DUPAAA')], friends: many, results: Array.from({length: 40}, (_, i) => night(`N${i}`))});
        expect(view.open).toHaveLength(1);
        expect(view.friends).toHaveLength(LOBBY_LIMITS.friends);
        expect(view.friends![0].code).toBe('T00000');
        expect(view.recent).toHaveLength(LOBBY_LIMITS.recent);
    });

    it('marks a night finished once its table closed or went idle, and links it while the room is kept', () => {
        const view = shape({
            results: [
                night('OPENAA', {closed: false, lastAt: NOW - HOUR, net: 300}),
                night('IDLEAA', {closed: false, lastAt: NOW - TIMING.IDLE_CLOSE_MS - 1}),
                night('DONEAA', {closed: true, lastAt: NOW - HOUR, net: -150, tableName: 'Friday'}),
                night('OLDAAA', {closed: true, lastAt: NOW - TIMING.ROOM_TTL_MS - 1}),
            ],
        });
        expect(view.recent).toEqual([
            {code: 'OPENAA', name: '', hands: 3, net: 300, finished: false, href: '/play/OPENAA'},
            {code: 'IDLEAA', name: '', hands: 3, net: 0, finished: true, href: '/play/IDLEAA'},
            {code: 'DONEAA', name: 'Friday', hands: 3, net: -150, finished: true, href: '/play/DONEAA'},
            {code: 'OLDAAA', name: '', hands: 3, net: 0, finished: true, href: null},
        ]);
        expect(nightFinished({closed: false, lastAt: NOW}, NOW)).toBe(false);
        expect(nightFinished({closed: true, lastAt: NOW}, NOW)).toBe(true);
    });

    it('leaves a night out of Recent while its table is listed open above', () => {
        const view = shape({mine: [room('LIVEAA')], results: [night('LIVEAA', {closed: false}), night('PASTAA')]});
        expect(view.recent?.map((n) => n.code)).toEqual(['PASTAA']);
    });

    it('hands the page no account id', () => {
        const view = shape({
            mine: [room('MINEAA')], friends: [room('FRNDAA', {hostUserId: FRIEND, hostName: 'Ben'})], results: [night('PASTAA')],
            seated: [room('SEATAA', {hostUserId: FRIEND, hostName: 'Ben'})],
        });
        expect(view.resume?.code).toBe('SEATAA');
        const text = JSON.stringify(view);
        expect(text).not.toContain(ME);
        expect(text).not.toContain(FRIEND);
        expect(text).not.toContain('room-PASTAA');
    });

    it('offers the newest open table the reader holds a seat at as the resume card', () => {
        const view = shape({
            seated: [
                room('OLDERA', {lastActivityAt: NOW - 30 * MIN}),
                room('NEWERA', {hostUserId: FRIEND, hostName: 'Ben', name: 'Friday', seated: 4, hands: 9, lastActivityAt: NOW - MIN}),
                room('IDLEAA', {lastActivityAt: NOW - TIMING.IDLE_CLOSE_MS - 1}),
                room('CLOSED', {status: 'closed', lastActivityAt: NOW}),
            ],
        });
        expect(view.resume).toEqual({
            code: 'NEWERA', name: 'Friday', status: 'open', seats: 8, seated: 4, hands: 9, variant: 'holdem', boards: 1, href: '/play/NEWERA', mine: false, host: 'Ben', sitting: true,
        });
        // The reader's own table, a seat held: theirs, and still listed under their open tables.
        const own = shape({mine: [room('MINEAA')], seated: [room('MINEAA')]});
        expect(own.resume).toMatchObject({code: 'MINEAA', mine: true, sitting: true});
        expect(own.open?.map((t) => t.code)).toEqual(['MINEAA']);
        // No seat at an open table: no card.
        expect(shape({seated: [room('IDLEAA', {lastActivityAt: NOW - TIMING.IDLE_CLOSE_MS - 1})]}).resume).toBeNull();
        expect(resumeOf(ME, [], NOW)).toBeNull();
    });
});

describe('tableLine', () => {
    const link = (over: Partial<TableLink> = {}): TableLink => ({
        code: 'K7QXM4', name: '', status: 'open', seats: 8, seated: 3, hands: 2, variant: 'holdem', boards: 1, href: '/play/K7QXM4', mine: true, host: 'Ana', sitting: false, ...over,
    });

    it('prints the reader\'s own table as the lobby\'s open rows do, anyone else\'s with its host, each opening with its game', () => {
        expect(tableLine(link())).toBe(POKER_NIGHT_COPY.openRow("Texas hold'em", 3, 8, 2));
        expect(tableLine(link({mine: false, host: 'Ben', variant: 'plo'}))).toBe(POKER_NIGHT_COPY.friendsRow('PLO', 'Ben', 3, 8));
        expect(tableLine(link({variant: 'plo', boards: 2}))).toBe(POKER_NIGHT_COPY.openRow('PLO · 2 boards', 3, 8, 2));
        expect(modeLine({variant: 'plo', boards: 1})).toBe(MODE_COPY.label('plo', 1));
        // A host with no name at the table: the seats and hands, never "Hosted by" nobody.
        expect(tableLine(link({mine: false, host: ''}))).toBe(POKER_NIGHT_COPY.openRow("Texas hold'em", 3, 8, 2));
    });
});

describe('homePokerNight', () => {
    const home = (input: Partial<Parameters<typeof homePokerNight>[0]> = {}) =>
        homePokerNight({userId: ME, mine: [], friends: [], seated: [], now: NOW, ...input});
    const friend = (code: string, over: Partial<LobbyRoom> = {}) => room(code, {hostUserId: FRIEND, hostName: 'Ben', ...over});

    it('is null with no row, so Home draws no box', () => {
        expect(home()).toBeNull();
        // Nothing open counts as nothing.
        expect(home({
            mine: [room('CLOSED', {status: 'closed'})],
            friends: [friend('IDLEAA', {lastActivityAt: NOW - TIMING.IDLE_CLOSE_MS - 1})],
            seated: [room('GONEAA', {status: 'closed'})],
        })).toBeNull();
    });

    it('lists the tables the reader holds a seat at first, then the ones they host from outside a seat', () => {
        const view = home({
            mine: [room('HOSTAA', {lastActivityAt: NOW}), room('SEATMI', {lastActivityAt: NOW - 2 * MIN})],
            seated: [room('SEATMI', {lastActivityAt: NOW - 2 * MIN}), friend('SEATFR', {lastActivityAt: NOW - 5 * MIN})],
        });
        expect(view?.tables?.map((t) => [t.code, t.mine, t.sitting])).toEqual([['SEATMI', true, true], ['SEATFR', false, true]]);
        expect(view?.friends).toBeNull();
        // One seat: the hosted table fills the other place.
        const one = home({mine: [room('HOSTAA', {lastActivityAt: NOW}), room('HOSTBB', {lastActivityAt: NOW - HOUR})], seated: [friend('SEATFR')]});
        expect(one?.tables?.map((t) => [t.code, t.sitting])).toEqual([['SEATFR', true], ['HOSTAA', false]]);
        expect(one?.tables?.[1]).toEqual({
            code: 'HOSTAA', name: '', status: 'open', seats: 8, seated: 1, hands: 0, variant: 'holdem', boards: 1, href: '/play/HOSTAA', mine: true, host: 'Ana', sitting: false,
        });
    });

    it('caps each list and lists every code once', () => {
        const many = (prefix: string, make: (code: string, over?: Partial<LobbyRoom>) => LobbyRoom) =>
            Array.from({length: 6}, (_, i) => make(`${prefix}${String(i).padStart(4, '0')}`, {lastActivityAt: NOW - i * MIN}));
        const view = home({mine: [...many('MI', room), room('MI0000')], friends: many('FR', friend), seated: many('SE', friend)});
        expect(view?.tables).toHaveLength(HOME_LIMITS.tables);
        expect(view?.tables?.every((t) => t.sitting)).toBe(true);
        expect(view?.friends?.map((t) => t.code)).toEqual(['FR0000', 'FR0001']);
        expect(HOME_LIMITS.friends).toBe(2);
    });

    it('offers friends\' open tables to join, never one the reader hosts or sits at, even past the cap', () => {
        const view = home({
            seated: [friend('SEAT01', {lastActivityAt: NOW}), friend('SEAT02', {lastActivityAt: NOW - MIN}), friend('SEAT03', {lastActivityAt: NOW - 2 * MIN})],
            friends: [
                friend('SEAT03'), friend('JOINAA', {seated: 5}), room('SELFAA'), friend('NONAME', {hostName: ''}),
                friend('CLOSED', {status: 'closed'}),
            ],
        });
        expect(view?.tables?.map((t) => t.code)).toEqual(['SEAT01', 'SEAT02']);
        expect(view?.friends).toEqual([{
            code: 'JOINAA', name: '', status: 'open', seats: 8, seated: 5, hands: 0, variant: 'holdem', boards: 1, href: '/play/JOINAA', mine: false, host: 'Ben', sitting: false,
        }]);
        // Friends' tables alone are enough for the panel.
        expect(home({friends: [friend('JOINAA')]})).toEqual({tables: null, friends: [expect.objectContaining({code: 'JOINAA'})]});
    });

    it('makes the chip at the top of Home the way back to the newest seat, else the lobby\u2019s', () => {
        const seated = home({
            mine: [room('HOSTAA', {lastActivityAt: NOW})],
            seated: [friend('SEATNW', {lastActivityAt: NOW - MIN}), friend('SEATOL', {lastActivityAt: NOW - 9 * MIN})],
        });
        expect(homeChipOf(seated)).toMatchObject({code: 'SEATNW', href: '/play/SEATNW', sitting: true});
        // Hosting without a seat, friends' tables, or nothing: the chip stays the lobby's.
        expect(homeChipOf(home({mine: [room('HOSTAA')]}))).toBeNull();
        expect(homeChipOf(home({friends: [friend('JOINAA')]}))).toBeNull();
        expect(homeChipOf(null)).toBeNull();
    });

    it('hands Home no account id', () => {
        const text = JSON.stringify(home({mine: [room('MINEAA')], friends: [friend('FRNDAA')], seated: [friend('SEATAA')]}));
        expect(text).not.toContain(ME);
        expect(text).not.toContain(FRIEND);
    });
});

describe('holdsSeat', () => {
    const doc = (seats: unknown, players: LobbyDoc['players']): Pick<LobbyDoc, 'state' | 'players'> => ({state: {handNo: 3, seats}, players});
    const players = [{userId: ME, pid: 'pid-me'}, {userId: FRIEND, pid: 'pid-friend'}, {userId: null, pid: 'pid-guest'}];

    it('is true while one of the account\'s player rows sits in the seats', () => {
        expect(holdsSeat(doc([null, {pid: 'pid-friend'}, {pid: 'pid-me', leaving: false}], players), ME)).toBe(true);
        // As Mongo projects state.seats.pid out of an array with empty seats in it.
        expect(holdsSeat(doc([{pid: 'pid-friend'}, {pid: 'pid-me'}], players), ME)).toBe(true);
    });

    it('is false for a watcher, a seat on its way out, another account\'s seat or a malformed read', () => {
        expect(holdsSeat(doc([{pid: 'pid-friend'}, null], players), ME)).toBe(false);
        expect(holdsSeat(doc([{pid: 'pid-me', leaving: true}], players), ME)).toBe(false);
        expect(holdsSeat(doc([{pid: 'pid-guest'}], players), ME)).toBe(false);
        expect(holdsSeat(doc([{pid: 'pid-me'}], [{userId: ME, pid: null}]), ME)).toBe(false);
        expect(holdsSeat(doc([{pid: 'pid-me'}], null), ME)).toBe(false);
        expect(holdsSeat(doc('seats', players), ME)).toBe(false);
        expect(holdsSeat({state: null, players}, ME)).toBe(false);
        expect(holdsSeat(doc([{pid: 'pid-me'}], [{userId: FRIEND, pid: 'pid-me'}]), ME)).toBe(false);
    });
});

describe('lobbyRoomFromDoc', () => {
    it('reads the mirrors, the hand count and the host\'s name at the table', () => {
        expect(lobbyRoomFromDoc({
            code: 'K7QXM4', name: 'Friday', hostUserId: ME, status: 'playing', seatCount: 6, seatsTaken: 4, lastActivityAt: new Date(NOW),
            state: {handNo: 17, config: {variant: 'plo', boards: 1}}, players: [{userId: null, name: 'Fox'}, {userId: FRIEND, name: 'Ben'}, {userId: ME, name: 'Ana'}],
        })).toEqual({code: 'K7QXM4', name: 'Friday', hostUserId: ME, hostName: 'Ana', status: 'playing', seats: 6, seated: 4, hands: 17, variant: 'plo', boards: 1, lastActivityAt: NOW});
    });

    it('reads a missing or malformed field as empty, and a document with no game as Texas hold\'em on one board', () => {
        expect(lobbyRoomFromDoc({code: 'K7QXM4', hostUserId: ME, status: 'open', state: {handNo: 'x'}, players: null})).toEqual({
            code: 'K7QXM4', name: '', hostUserId: ME, hostName: '', status: 'open', seats: 0, seated: 0, hands: 0, variant: 'holdem', boards: 1, lastActivityAt: 0,
        });
        expect(lobbyRoomFromDoc({code: 'K7QXM4', hostUserId: ME, status: 'open', state: {config: {variant: 'stud', boards: 9}}})).toMatchObject({variant: 'holdem', boards: 1});
        expect(lobbyRoomFromDoc({code: 'K7QXM4', hostUserId: ME, status: 'open', state: {config: {variant: 'plo', boards: 3}}})).toMatchObject({variant: 'plo', boards: 3});
        expect(lobbyRoomFromDoc({code: 'K7QXM4', hostUserId: ME, status: 'open', lastActivityAt: new Date(NOW).toISOString()}).lastActivityAt).toBe(NOW);
    });

    it('projects nothing private: of the state only the hand count and the game, no guest, no seat pass, no ban', () => {
        expect(Object.keys(LOBBY_PROJECTION).sort()).toEqual([
            '_id', 'code', 'hostUserId', 'lastActivityAt', 'name', 'players.name', 'players.userId', 'seatCount', 'seatsTaken',
            'state.config.boards', 'state.config.variant', 'state.handNo', 'status',
        ]);
    });

    it('reads a seat-holder\'s tables with only the pids and leaving flags besides: no card, stack or guest', () => {
        expect(Object.keys(SEATED_PROJECTION).sort()).toEqual([
            ...Object.keys(LOBBY_PROJECTION), 'players.pid', 'state.seats.leaving', 'state.seats.pid',
        ].sort());
        expect(Object.values(SEATED_PROJECTION).every((v, i) => (Object.keys(SEATED_PROJECTION)[i] === '_id' ? v === 0 : v === 1))).toBe(true);
    });
});

describe('invitePath', () => {
    it('opens a new table with its invite sheet', () => {
        expect(invitePath('K7QXM4')).toBe('/play/K7QXM4?invite=1');
    });
});

describe('openRoomsFilter', () => {
    it('asks for rooms in the env that are not closed, active within the host window and not expired', () => {
        expect(openRoomsFilter('preview', NOW)).toEqual({
            env: 'preview',
            status: {$ne: 'closed'},
            lastActivityAt: {$gt: new Date(NOW - LIMITS.hostActiveWindowMs)},
            expiresAt: {$gt: new Date(NOW)},
        });
    });
});

describe('the name and look an account starts from', () => {
    it('is what the account saved', () => {
        const avatar = 'v1:owl:sky:ring:star';
        expect(profileOf({name: 'Ana B', avatar}, 'Someone Else', ME)).toEqual({
            name: 'Ana B', avatar, look: DEFAULT_PERSONAL_LOOK, table: {scene: 'casino-classic', felt: 'emerald'}, saved: {name: 'Ana B', avatar},
        });
    });

    it('carries the saved personal look and the table look over the defaults, field by field', () => {
        const saved = {name: null, avatar: null, look: {cardBack: 'tartan' as const, sound: false}, table: {scene: 'deep-space' as const, felt: 'rose' as const}};
        expect(profileOf(saved, 'Ada', ME)).toMatchObject({look: {...DEFAULT_PERSONAL_LOOK, cardBack: 'tartan', sound: false}, table: {scene: 'deep-space', felt: 'rose'}});
        // Whatever a stored value holds, each field reads on its own.
        const odd = {name: null, avatar: null, look: {cardBack: 'plaid', chips: 'neon'} as never, table: {scene: 'moon', felt: 'teal'} as never};
        expect(profileOf(odd, 'Ada', ME)).toMatchObject({look: {...DEFAULT_PERSONAL_LOOK, chips: 'neon'}, table: {scene: 'casino-classic', felt: 'teal'}});
    });

    it('falls back on the first name and the look the account id rolls', () => {
        const rolled = encodeAvatar(avatarForUser(ME));
        expect(profileOf({name: null, avatar: null}, '  Ada   Lovelace ', ME)).toMatchObject({name: 'Ada', avatar: rolled, saved: {name: null, avatar: null}});
        expect(profileOf({name: null, avatar: null}, 'Ada', ME).avatar).toBe(profileOf({name: null, avatar: null}, 'Other', ME).avatar);
        // A saved value that no longer reads is ignored.
        expect(profileOf({name: '​', avatar: 'v9:nope'}, 'Ada', ME)).toMatchObject({name: 'Ada', avatar: rolled});
    });

    it('takes the first word of an account name, cleaned', () => {
        expect(firstNameOf('Ada Lovelace')).toBe('Ada');
        expect(firstNameOf('')).toBe('');
        expect(firstNameOf(null)).toBe('');
        expect(firstNameOf('‮evil name')).toBe('evil');
        expect(firstNameOf('Bartholomew-Maximilian-Fitzgerald')).toHaveLength(16);
    });
});

describe('the look a browser kept', () => {
    const avatar = 'v1:fox:tangerine:none:none';

    it('reads a name and a look, each only when it still reads', () => {
        expect(readStoredMe(JSON.stringify({name: ' Sam ', avatar, look: {cardBack: 'aero'}}))).toEqual({name: 'Sam', avatar});
        expect(readStoredMe(JSON.stringify({name: 'Sam', avatar: 'v1:nope'}))).toEqual({name: 'Sam', avatar: null});
        expect(readStoredMe(JSON.stringify({name: '', avatar}))).toEqual({name: null, avatar});
    });

    it('reads nothing from an empty, broken or foreign value', () => {
        for (const raw of [null, '', 'not json', '42', 'null', '[]', JSON.stringify({name: 7, avatar: false}), JSON.stringify({})]) {
            expect(readStoredMe(raw), String(raw)).toBeNull();
        }
    });

    it('is offered for the account only when it differs from what the account has', () => {
        const profile = {name: 'Sam', avatar};
        expect(storedDiffers(null, profile)).toBe(false);
        expect(storedDiffers({name: 'Sam', avatar}, profile)).toBe(false);
        expect(storedDiffers({name: 'Sam', avatar: null}, profile)).toBe(false);
        expect(storedDiffers({name: 'Ana', avatar: null}, profile)).toBe(true);
        expect(storedDiffers({name: null, avatar: 'v1:owl:sky:ring:star'}, profile)).toBe(true);
    });
});

describe('the form under "Set it up first"', () => {
    it('starts on the defaults', () => {
        expect(configFromForm(DEFAULT_FORM)).toEqual({
            seats: DEFAULT_CONFIG.seats, smallBlind: DEFAULT_CONFIG.smallBlind, bigBlind: DEFAULT_CONFIG.bigBlind,
            buyInMin: DEFAULT_CONFIG.buyInMin, buyInMax: DEFAULT_CONFIG.buyInMax, rebuys: DEFAULT_CONFIG.rebuys, turnSeconds: DEFAULT_CONFIG.turnSeconds,
            variant: 'holdem', boards: 1,
        });
        expect(DEFAULT_FORM.blinds).toBeGreaterThanOrEqual(0);
    });

    it('offers only what the limits allow: every choice makes a config checkConfig accepts', () => {
        for (let blinds = 0; blinds < BLIND_PRESETS.length; blinds++) {
            const bigBlind = BLIND_PRESETS[blinds][1];
            expect(chipOptions(bigBlind).length, String(bigBlind)).toBeGreaterThan(0);
            for (const chips of CHIP_PRESETS) {
                for (const seats of SEAT_CHOICES) {
                    for (const rebuys of REBUY_CHOICES) {
                        for (const turnSeconds of TIMER_PRESETS) {
                            for (const variant of GAME_CHOICES) {
                                for (const boards of boardChoices(variant)) {
                                    const form = {blinds, chips, seats, rebuys, turnSeconds, variant, boards};
                                    const checked = checkConfig(mergeConfig(DEFAULT_CONFIG, configFromForm(form)));
                                    expect(checked.ok, JSON.stringify(form)).toBe(true);
                                }
                            }
                        }
                    }
                }
            }
        }
        expect(SEAT_CHOICES).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
        // The games this deploy deals, Texas hold'em first; one to three boards in PLO.
        expect(GAME_CHOICES).toEqual(['holdem', 'plo']);
        expect(boardChoices('plo')).toEqual([1, 2, 3]);
        expect(boardChoices('holdem')).toEqual([1]);
        // A board count past one is PLO's alone: the form sends one for any other game.
        expect(configFromForm({...DEFAULT_FORM, variant: 'holdem', boards: 3})).toMatchObject({variant: 'holdem', boards: 1});
        expect(configFromForm({...DEFAULT_FORM, variant: 'plo', boards: 2})).toMatchObject({variant: 'plo', boards: 2});
    });

    it('keeps the chips chosen while the blinds allow them, else the nearest allowed', () => {
        const at = (sb: number) => BLIND_PRESETS.findIndex(([s]) => s === sb);
        expect(chipsFor({blinds: at(10), chips: 5000})).toBe(5000);
        // 10/20 allows at most 500 big blinds: 10,000.
        expect(chipOptions(20)).toEqual([500, 1000, 2000, 5000, 10_000]);
        expect(chipsFor({blinds: at(10), chips: 100_000})).toBe(10_000);
        // 500/1,000 allows nothing under one big blind.
        expect(chipsFor({blinds: at(500), chips: 500})).toBe(1000);
        // An unknown preset index falls back on the default blinds.
        expect(configFromForm({...DEFAULT_FORM, blinds: 99})).toMatchObject({smallBlind: 10, bigBlind: 20});
    });
});

describe('configIssueText', () => {
    it('says what checkConfig turned down in the host drawer\'s words, else that the settings are out of range', () => {
        const checked = checkConfig({...DEFAULT_CONFIG, bigBlind: 5, smallBlind: 10});
        expect(checked.ok).toBe(false);
        if (!checked.ok) expect(configIssueText(checked.issues)).toBe(HOST_COPY.issues['below-small-blind']);
        expect(configIssueText([{path: 'seats', message: 'Too small: expected number to be >=2'}])).toBe(LOBBY_COPY.badConfig);
        expect(configIssueText([])).toBe(LOBBY_COPY.badConfig);
        // A key on the object's prototype is not an issue's sentence.
        expect(configIssueText([{path: 'x', message: 'toString'}])).toBe(LOBBY_COPY.badConfig);
    });
});
