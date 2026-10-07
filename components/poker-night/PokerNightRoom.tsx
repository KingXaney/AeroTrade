'use client';

// The /play/[code] table's client root: it runs the feed (useTableFeed), keeps this browser's own
// name, look and personal settings (localStorage, lib/poker-night/lobby.ME_STORAGE_KEY, which the
// lobby's My look reads too), builds the room controller and hands it to everything below through
// RoomControllerContext. It draws nothing of its own: TableScreen is the table.
//
// Rolling a look never happens in render: the page rolls a guest's first look on the server, and
// the join card's Roll button rolls in its click handler.

import {useCallback, useEffect, useMemo, useState, useSyncExternalStore} from "react";
import TableScreen from "@/components/poker-night/TableScreen";
import {
    DEFAULT_PERSONAL, RoomControllerContext, type JoinBody, type JoinResult, type PersonalLook, type Profile, type RoomController,
} from "@/components/poker-night/room-controller";
import {useTableFeed} from "@/components/poker-night/useTableFeed";
import {POKER_NIGHT_ERRORS} from "@/lib/learn/copy/poker-night";
import {isAvatar} from "@/lib/poker-night/avatar";
import {ME_STORAGE_KEY} from "@/lib/poker-night/lobby";
import {cleanName} from "@/lib/poker-night/names";
import type {GameConfig} from "@/lib/poker-night/types";
import type {PlayPageView} from "@/lib/poker-night/view-types";

// ── this browser's name, look and settings ──

type StoredMe = {name: string | null; avatar: string | null; look: PersonalLook};

const EMPTY_ME: StoredMe = Object.freeze({name: null, avatar: null, look: DEFAULT_PERSONAL});

const CARD_BACK = /^[a-z][a-z-]{0,23}$/;

const lookOf = (raw: unknown): PersonalLook => {
    const look = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<Record<keyof PersonalLook, unknown>>;
    const flag = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);
    return {
        cardBack: typeof look.cardBack === 'string' && CARD_BACK.test(look.cardBack) ? look.cardBack : DEFAULT_PERSONAL.cardBack,
        fourColour: flag(look.fourColour, DEFAULT_PERSONAL.fourColour),
        sound: flag(look.sound, DEFAULT_PERSONAL.sound),
        muteEmotes: flag(look.muteEmotes, DEFAULT_PERSONAL.muteEmotes),
        shortcuts: flag(look.shortcuts, DEFAULT_PERSONAL.shortcuts),
    };
};

const parseObject = (raw: string | null): Record<string, unknown> | null => {
    if (!raw) return null;
    try {
        const parsed: unknown = JSON.parse(raw);
        return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
    } catch {
        return null;
    }
};

const parseMe = (raw: string | null): StoredMe => {
    const value = parseObject(raw);
    if (!value) return EMPTY_ME;
    return {name: cleanName(value.name), avatar: isAvatar(value.avatar) ? value.avatar : null, look: lookOf(value.look)};
};

const readRaw = (): string | null => {
    try {
        return window.localStorage.getItem(ME_STORAGE_KEY);
    } catch {
        return null;
    }
};

// The parsed value, kept while the stored text is the same, so a snapshot is stable.
let cachedMe: {raw: string | null; me: StoredMe} = {raw: null, me: EMPTY_ME};
const meListeners = new Set<() => void>();

const getMe = (): StoredMe => {
    const raw = readRaw();
    if (raw !== cachedMe.raw) cachedMe = {raw, me: parseMe(raw)};
    return cachedMe.me;
};

const getServerMe = (): StoredMe => EMPTY_ME;

const subscribeMe = (listener: () => void) => {
    meListeners.add(listener);
    const onStorage = (e: StorageEvent) => {
        if (e.key === null || e.key === ME_STORAGE_KEY) listener();
    };
    window.addEventListener('storage', onStorage);
    return () => {
        meListeners.delete(listener);
        window.removeEventListener('storage', onStorage);
    };
};

type MePatch = {name?: string | null; avatar?: string | null; look?: Partial<PersonalLook>};

// Writes over what is kept, leaving any part a later version added in place. Where the browser
// keeps nothing (a private window), the change still holds for this page.
const writeMe = (patch: MePatch): void => {
    const base = parseObject(readRaw()) ?? {};
    const look = {...(typeof base.look === 'object' && base.look !== null ? base.look : {}), ...(patch.look ?? {})};
    const next: Record<string, unknown> = {...base, v: 1, look};
    if (patch.name !== undefined) next.name = patch.name;
    if (patch.avatar !== undefined) next.avatar = patch.avatar;
    try {
        window.localStorage.setItem(ME_STORAGE_KEY, JSON.stringify(next));
    } catch {
        // Kept in memory only.
    }
    cachedMe = {raw: readRaw(), me: parseMe(JSON.stringify(next))};
    for (const listener of [...meListeners]) listener();
};

// ── the room ──

export type PokerNightRoomProps = {
    code: string;
    shareUrl: string;
    initial: PlayPageView;
    config: GameConfig; // the table's rules, for the join card before a join
    suggested: Profile; // an account's saved name and look, or a guest's fresh look and no name
    signedIn: boolean;
    invite: boolean;
    pollScale: number; // POKER_NIGHT_POLL_MS: a floor on every poll's wait
    realtime: boolean; // this deployment has realtime (lib/poker-night/channel.realtimeEnabled): the table goes live over Ably
};

const PokerNightRoom = ({code, shareUrl, initial, config, suggested, signedIn, invite, pollScale, realtime}: PokerNightRoomProps) => {
    const feed = useTableFeed({code, initial, pollScale, realtime});
    const stored = useSyncExternalStore(subscribeMe, getMe, getServerMe);
    const [edits, setEdits] = useState<Partial<Profile>>({});

    // A guest's first look is kept from the first visit on, so a reload sits them down the same.
    useEffect(() => {
        if (!signedIn && getMe().avatar === null) writeMe({avatar: suggested.avatar});
    }, [signedIn, suggested.avatar]);

    // The invite link's ?invite=1 opens the sheet once; a reload of the table does not.
    useEffect(() => {
        if (!invite) return;
        const url = new URL(window.location.href);
        if (!url.searchParams.has('invite')) return;
        url.searchParams.delete('invite');
        window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    }, [invite]);

    const profile = useMemo<Profile>(() => {
        // An account sits as its own name and look; a guest as what this browser kept.
        const base = signedIn
            ? {name: suggested.name || stored.name || '', avatar: suggested.avatar}
            : {name: stored.name ?? suggested.name, avatar: stored.avatar ?? suggested.avatar};
        return {...base, ...edits};
    }, [signedIn, suggested, stored, edits]);

    const setProfile = useCallback((patch: Partial<Profile>) => {
        setEdits((prev) => ({...prev, ...patch}));
        writeMe(patch);
    }, []);

    const setPersonal = useCallback((patch: Partial<PersonalLook>) => writeMe({look: patch}), []);

    const {join: feedJoin} = feed;
    const join = useCallback(async (body: JoinBody): Promise<JoinResult> => {
        const result = await feedJoin(body);
        if (result.ok) writeMe({...(cleanName(body.name) ? {name: cleanName(body.name)} : {}), avatar: body.avatar});
        return result;
    }, [feedJoin]);

    const {state, mode, transport, problem, send, detail, serverNow} = feed;
    const joinView = 'join' in initial ? initial.join : null;
    const controller = useMemo<RoomController>(() => {
        // The feed always holds one of the two: the viewer's own view, or the page's preview.
        const table = (state.view ?? state.preview)!;
        return {
            view: state.view, preview: state.preview, table,
            joinView: state.view ? null : joinView,
            me: state.view?.me ?? null,
            config: state.view?.config ?? config,
            hasAccount: state.view?.me.hasAccount ?? joinView?.hasAccount ?? signedIn,
            serverOffset: state.offset, serverNow, mode, transport,
            problem: problem ? {code: problem, message: POKER_NIGHT_ERRORS[problem]} : null,
            events: state.events,
            send, join, detail,
            personal: stored.look, setPersonal,
            profile, setProfile,
            shareUrl, code, invite,
        };
    }, [state, joinView, config, signedIn, serverNow, mode, transport, problem, send, join, detail, stored.look, setPersonal, profile, setProfile, shareUrl, code, invite]);

    return (
        <RoomControllerContext.Provider value={controller}>
            <TableScreen/>
        </RoomControllerContext.Provider>
    );
};

export default PokerNightRoom;
