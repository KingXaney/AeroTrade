'use client';

// The table's one handle on its room, shared by everything on /play/[code] through React context:
// the latest view, the clock, the animation events, the moves, and this browser's own look. Built
// by components/poker-night/PokerNightRoom from useTableFeed; every table and overlay component reads
// it with useRoom() and takes no room props of its own.
//
// Nothing here calls a server action — the table talks to its route handlers only
// (components/poker-night/table-api) — and nothing here reaches the server's modules.

import {createContext, useContext, useSyncExternalStore} from "react";
import type {JoinOutcome} from "@/lib/poker-night/view-types";
import type {PokerNightErrorCode} from "@/lib/poker-night/http";
import type {ActionInput, JoinBody as JoinInputBody} from "@/lib/poker-night/input";
import type {FeedMode, RoomEvent, Transport} from "@/lib/poker-night/feed";
import type {GameConfig} from "@/lib/poker-night/types";
import type {DetailView, EmoteView, JoinView, MeView, PlayerView, RoomView} from "@/lib/poker-night/view-types";
import type {EmoteInput} from "@/lib/poker-night/emotes";
import {DEFAULT_PERSONAL_LOOK, type PersonalLook} from "@/lib/poker-night/personal";

// An action as a component asks for it: the room adds the actionId (one per intent, reused on the
// one retry a busy table gets).
type WithoutId<T> = T extends unknown ? Omit<T, 'actionId'> : never;
export type ActionBody = WithoutId<ActionInput>;

// A join as the join card asks for it: the room adds the joinId.
export type JoinBody = Omit<JoinInputBody, 'joinId'>;

export type SendResult =
    | {ok: true; view: PlayerView; duplicate: boolean}
    | {ok: false; code: PokerNightErrorCode; message: string};

export type JoinResult =
    | {ok: true; view: PlayerView; outcome: JoinOutcome; renamed: string | null}
    | {ok: false; code: PokerNightErrorCode; message: string};

// How an emote went (P6): sent, or refused with the code and its sentence.
export type EmoteResult = {ok: true} | {ok: false; code: PokerNightErrorCode; message: string};

export type DetailPart = DetailView['part'];
export type DetailOptions = {hand?: number | null; before?: number | null};

// What each player picks for their own eyes only (card back and face, suits, chips, sound, buzz,
// screen wake, shortcuts, hand hints, muted emotes): lib/poker-night/personal, kept in this browser
// and laid over an account's saved look. `room.personal` is always whole.
export type {PersonalLook};
export const DEFAULT_PERSONAL: Readonly<PersonalLook> = DEFAULT_PERSONAL_LOOK;

// The name and look the join card starts from: the account's saved ones, else what this browser
// kept, else a look rolled for this visit.
export type Profile = {name: string; avatar: string};

// A seated player's new name and look while a hand is being played (My look's draft): kept by the
// room while the drawer is shut, and — once the player pressed Save (queued) — sent with the room's
// 'profile' action by itself as soon as the hand ends.
export type ProfileDraft = Profile & {queued: boolean};

export type RoomController = {
    // The viewer's own view once they have joined (to play or to watch); null before.
    view: PlayerView | null;
    // The public table the page rendered for a visitor who has not joined; null once they have.
    preview: RoomView | null;
    // Whichever of the two the table draws: never null.
    table: RoomView;
    // What the join card needs before a join: whether the visitor may join, the open seats, the
    // chips range. Null once joined.
    joinView: JoinView | null;
    me: MeView | null;
    config: GameConfig; // the table's rules (the view's once joined, the page's before)
    hasAccount: boolean;
    serverOffset: number; // server minus browser, ms
    serverNow: () => number; // the server's time now; call it in a handler or an effect, never in render
    mode: FeedMode;
    transport: Transport; // what carries the table now: the realtime channel, polls, or both
    // Something the table cannot carry on through ('reload' after a deploy); null otherwise.
    problem: {code: PokerNightErrorCode; message: string} | null;
    events: RoomEvent[]; // animation events, newest last, each with a stable id
    // The latest emotes (P6), once each, never from before the page loaded; and the way to send one.
    emotes: EmoteView[];
    sendEmote: (input: EmoteInput) => Promise<EmoteResult>;
    send: (body: ActionBody) => Promise<SendResult>;
    join: (body: JoinBody) => Promise<JoinResult>;
    detail: (part: DetailPart, opts?: DetailOptions) => Promise<DetailView | null>;
    personal: PersonalLook;
    setPersonal: (patch: Partial<PersonalLook>) => void;
    profile: Profile;
    setProfile: (patch: Partial<Profile>) => void;
    profileDraft: ProfileDraft | null;
    setProfileDraft: (draft: ProfileDraft | null) => void;
    shareUrl: string;
    code: string;
    invite: boolean; // the host just started the table (?invite=1): the invite sheet opens first
};

export const RoomControllerContext = createContext<RoomController | null>(null);

export const useRoom = (): RoomController => {
    const room = useContext(RoomControllerContext);
    if (!room) throw new Error('useRoom: no poker night room above this component');
    return room;
};

// ── the server's clock, for countdowns ──

const tickers = new Map<number, (onChange: () => void) => () => void>();
const tickerFor = (intervalMs: number) => {
    let subscribe = tickers.get(intervalMs);
    if (!subscribe) {
        subscribe = (onChange: () => void) => {
            const id = setInterval(onChange, intervalMs);
            return () => clearInterval(id);
        };
        tickers.set(intervalMs, subscribe);
    }
    return subscribe;
};

// The server's time, refreshed every intervalMs while a component uses it (a turn ring, the next
// deal's countdown). The server render and hydration read the view's own serverNow, so both agree.
export const useServerNow = (intervalMs = 1000): number => {
    const {serverOffset, table} = useRoom();
    const step = Math.max(50, intervalMs);
    return useSyncExternalStore(
        tickerFor(step),
        () => Math.floor((Date.now() + serverOffset) / step) * step,
        () => table.serverNow,
    );
};
