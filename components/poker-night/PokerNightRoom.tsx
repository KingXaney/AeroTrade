'use client';

// The /play/[code] table's client root: it runs the feed (useTableFeed), keeps this browser's own
// name, look and personal look (localStorage under lib/poker-night/personal.ME_STORAGE_KEY, which
// the lobby's My look reads and writes too), builds the room controller and hands it to everything
// below through RoomControllerContext. It draws nothing of its own: TableScreen is the table.
//
// The personal look a player sees with is this browser's own changes laid over an account's saved
// look (the page hands it over as savedLook; a guest has the defaults), field by field
// (lib/poker-night/personal.effectiveLook). A change at the table is kept in this browser at once
// and never sent anywhere: the lobby offers to save it to the account.
//
// Rolling a look never happens in render: the page rolls a guest's first look on the server, and
// the join card's Roll button rolls in its click handler.
//
// My look's draft of a new name and look lives here, not in the drawer, so it outlasts the drawer
// (the viewer's turn closes it): a seated player who saves while a hand is being played queues it,
// and it is sent with the room's 'profile' action by itself the moment the hand ends (said in a
// toast either way).
//
// It also follows the viewer's own seat from view to view — its state and the viewer's own `next` —
// beside the sit-outs and sit-ins they send (lib/poker-night/overlays.rememberSitOut), so a sit-out
// that turns up without one of theirs is the host's doing, and once the seat sits out the dock says
// so ("The host sat you out."). A sit-out they send is also noted in this browser
// (overlays.SIT_OUT_ASK_KEY), so another tab, or this page after a reload, never takes it for the
// host's.
//
// "Let others ask to see my cards" is the one part of the personal look the room keeps too (for the
// player's seat, forgotten once they have none): whenever the viewer's seat lacks the choice this
// browser holds — they sat down, or turned it in My look — it is sent ('allow-asks'), once per seat
// and choice, so a refusal is not sent again in a loop.

import {useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore} from "react";
import {toast} from "sonner";
import TableScreen from "@/components/poker-night/TableScreen";
import {
    RoomControllerContext, type ActionBody, type JoinBody, type JoinResult, type PersonalLook, type Profile, type ProfileDraft, type RoomController,
} from "@/components/poker-night/room-controller";
import {useTableFeed} from "@/components/poker-night/useTableFeed";
import {LOOKS_COPY, POKER_NIGHT_ERRORS} from "@/lib/learn/copy/poker-night";
import {
    profileWaits, rememberSitOut, SIT_OUT_ASK_KEY, SIT_OUT_MEMORY, sitOutAskRecord, sitOutAsked, type SitOutMemory,
} from "@/lib/poker-night/overlays";
import {cleanName} from "@/lib/poker-night/names";
import {
    DEFAULT_PERSONAL_LOOK, effectiveLook, EMPTY_ME, ME_STORAGE_KEY, nextStoredMe, parseStoredMe, resolvePersonalLook, type MePatch, type StoredMe,
} from "@/lib/poker-night/personal";
import type {GameConfig} from "@/lib/poker-night/types";
import type {PlayPageView} from "@/lib/poker-night/view-types";

// ── this browser's name, look and settings ──

const readRaw = (): string | null => {
    try {
        return window.localStorage.getItem(ME_STORAGE_KEY);
    } catch {
        return null;
    }
};

// The parsed value, kept while the stored text is the same, so a snapshot is stable. Where the
// browser keeps nothing (a private window), the last change still holds for this page.
let cachedMe: {raw: string | null; me: StoredMe} = {raw: null, me: EMPTY_ME};
let unsaved: string | null = null;
const meListeners = new Set<() => void>();

const getMe = (): StoredMe => {
    const raw = readRaw() ?? unsaved;
    if (raw !== cachedMe.raw) cachedMe = {raw, me: parseStoredMe(raw)};
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

// Writes over what is kept, field by field, leaving any part a later version added in place.
const writeMe = (patch: MePatch): void => {
    const next = nextStoredMe(readRaw() ?? unsaved, patch);
    try {
        window.localStorage.setItem(ME_STORAGE_KEY, next);
        unsaved = null;
    } catch {
        unsaved = next;
    }
    for (const listener of [...meListeners]) listener();
};

// This browser's note of a sit-out the viewer sent (lib/poker-night/overlays.SIT_OUT_ASK_KEY), read
// by every tab of the table: another tab, or the page after a reload, then never takes that sit-out
// for the host's.
const askListeners = new Set<() => void>();

const readSitOutAsk = (): string | null => {
    try {
        return window.localStorage.getItem(SIT_OUT_ASK_KEY);
    } catch {
        return null;
    }
};

const getServerSitOutAsk = (): string | null => null;

const subscribeSitOutAsk = (listener: () => void) => {
    askListeners.add(listener);
    const onStorage = (e: StorageEvent) => {
        if (e.key === null || e.key === SIT_OUT_ASK_KEY) listener();
    };
    window.addEventListener('storage', onStorage);
    return () => {
        askListeners.delete(listener);
        window.removeEventListener('storage', onStorage);
    };
};

const writeSitOutAsk = (value: string | null): void => {
    try {
        if (value === null) window.localStorage.removeItem(SIT_OUT_ASK_KEY);
        else window.localStorage.setItem(SIT_OUT_ASK_KEY, value);
    } catch {
        // A browser that keeps nothing: this page's own memory still knows.
    }
    for (const listener of [...askListeners]) listener();
};

// ── the room ──

export type PokerNightRoomProps = {
    code: string;
    shareUrl: string;
    initial: PlayPageView;
    config: GameConfig; // the table's rules, for the join card before a join
    suggested: Profile; // an account's saved name and look, or a guest's fresh look and no name
    savedLook?: Partial<PersonalLook> | null; // an account's saved personal look (lib/poker-night/personal); none for a guest
    signedIn: boolean;
    invite: boolean;
    pollScale: number; // POKER_NIGHT_POLL_MS: a floor on every poll's wait
    realtime: boolean; // this deployment has realtime (lib/poker-night/channel.realtimeEnabled): the table goes live over Ably
};

const PokerNightRoom = ({code, shareUrl, initial, config, suggested, savedLook = null, signedIn, invite, pollScale, realtime}: PokerNightRoomProps) => {
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

    // The look this browser plays with: its own changes over the account's saved look.
    const personal = useMemo(() => effectiveLook(stored, resolvePersonalLook(savedLook, DEFAULT_PERSONAL_LOOK)), [stored, savedLook]);

    const {join: feedJoin} = feed;
    const join = useCallback(async (body: JoinBody): Promise<JoinResult> => {
        const result = await feedJoin(body);
        if (result.ok) writeMe({...(cleanName(body.name) ? {name: cleanName(body.name)} : {}), avatar: body.avatar});
        return result;
    }, [feedJoin]);

    const {state, mode, transport, problem, send: feedSend, detail, serverNow, sendEmote} = feed;
    const view = state.view;

    // Whether the host sat the viewer out: their seat followed from view to view, beside the
    // sit-outs and sit-ins they send themselves (the view never says who asked).
    const [sitOut, setSitOut] = useState<SitOutMemory>(SIT_OUT_MEMORY);
    const seatState = view && view.me.seat !== null ? view.seats[view.me.seat]?.state ?? null : null;
    const ownNext = view && view.me.seat !== null ? view.me.next : null;
    const myPid = view?.me.pid ?? null;
    // A sit-out this browser sent from another tab, or before a reload, is the viewer's own.
    const askRaw = useSyncExternalStore(subscribeSitOutAsk, readSitOutAsk, getServerSitOutAsk);
    const askedHere = myPid !== null && view !== null && sitOutAsked(askRaw, code, myPid, view.serverNow);
    if (seatState !== sitOut.state || ownNext !== sitOut.next) setSitOut(rememberSitOut(sitOut, {state: seatState, next: ownNext, askedHere}));
    const send = useCallback(async (body: ActionBody) => {
        if (body.type === 'sit-out' || body.type === 'sit-in') {
            const sent = body.type;
            setSitOut((m) => rememberSitOut(m, {sent}));
            if (myPid !== null) writeSitOutAsk(sent === 'sit-out' ? sitOutAskRecord(code, myPid, Date.now()) : null);
        }
        const r = await feedSend(body);
        if (!r.ok && body.type === 'sit-out') {
            setSitOut((m) => rememberSitOut(m, {refused: 'sit-out'}));
            writeSitOutAsk(null);
        }
        return r;
    }, [feedSend, code, myPid]);

    // "Let others ask to see my cards": the seat told whenever it lacks this browser's choice.
    const allowWanted = personal.allowAsks;
    const allowHeld = view?.me.allowAsks ?? true;
    const allowSeat = view?.me.seat ?? null;
    const allowSent = useRef<string | null>(null);
    useEffect(() => {
        if (allowSeat === null) {
            allowSent.current = null;
            return;
        }
        if (allowWanted === allowHeld) return;
        const key = `${allowSeat}:${allowWanted}`;
        if (allowSent.current === key) return;
        allowSent.current = key;
        void send({type: 'allow-asks', on: allowWanted});
    }, [allowSeat, allowWanted, allowHeld, send]);

    // My look's draft, and a queued save sent the moment the hand in play ends.
    const [profileDraft, setProfileDraft] = useState<ProfileDraft | null>(null);
    const sendingDraft = useRef(false);
    const draftDue = profileDraft?.queued === true && view !== null && !profileWaits(view);
    useEffect(() => {
        if (!draftDue || !profileDraft || sendingDraft.current) return;
        sendingDraft.current = true;
        const sent = {name: profileDraft.name, avatar: profileDraft.avatar};
        void send({type: 'profile', ...sent}).then((r) => {
            sendingDraft.current = false;
            // An edit made while it was on its way stays as the draft.
            const keepEdit = (d: ProfileDraft | null) => (d && (d.name !== sent.name || d.avatar !== sent.avatar) ? d : null);
            // A new hand dealt before it landed: it goes when that one ends.
            if (!r.ok && r.code === 'not_now') return;
            if (!r.ok) {
                setProfileDraft((d) => (d ? {...d, queued: false} : d));
                toast.error(r.message);
                return;
            }
            const saved = r.view.people[r.view.me.pid];
            if (saved) setProfile({name: saved.name, avatar: saved.avatar});
            setProfileDraft(keepEdit);
            toast.success(LOOKS_COPY.queuedDone);
        });
    }, [draftDue, profileDraft, send, setProfile]);
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
            emotes: state.emotes, sendEmote,
            send, join, detail,
            personal, setPersonal,
            profile, setProfile,
            profileDraft, setProfileDraft,
            // Said once the seat sits out, not while it waits on the hand in play.
            satOutByHost: sitOut.byHost && sitOut.state === 'sitting-out',
            shareUrl, code, invite,
        };
    }, [state, joinView, config, signedIn, serverNow, mode, transport, problem, send, sendEmote, join, detail, personal, setPersonal, profile, setProfile,
        profileDraft, sitOut.byHost, sitOut.state, shareUrl, code, invite]);

    return (
        <RoomControllerContext.Provider value={controller}>
            <TableScreen/>
        </RoomControllerContext.Provider>
    );
};

export default PokerNightRoom;
