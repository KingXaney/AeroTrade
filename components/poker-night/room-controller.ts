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
import type {FeedMode, RoomEvent} from "@/lib/poker-night/feed";
import type {GameConfig} from "@/lib/poker-night/types";
import type {DetailView, JoinView, MeView, PlayerView, RoomView} from "@/lib/poker-night/view-types";

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

export type DetailPart = DetailView['part'];
export type DetailOptions = {hand?: number | null; before?: number | null};

// What each player picks for their own eyes only, kept in this browser (P3 has the defaults; the
// look drawer and its registries come in P5).
export type PersonalLook = {
    cardBack: string;
    fourColour: boolean;
    sound: boolean;
    muteEmotes: boolean;
    shortcuts: boolean; // the table's single-key shortcuts (F, C, R, A); a player can turn them off
};

export const DEFAULT_PERSONAL: Readonly<PersonalLook> = Object.freeze({cardBack: 'classic-red', fourColour: false, sound: true, muteEmotes: false, shortcuts: true});

// The name and look the join card starts from: the account's saved ones, else what this browser
// kept, else a look rolled for this visit.
export type Profile = {name: string; avatar: string};

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
    // Something the table cannot carry on through ('reload' after a deploy); null otherwise.
    problem: {code: PokerNightErrorCode; message: string} | null;
    events: RoomEvent[]; // animation events, newest last, each with a stable id
    send: (body: ActionBody) => Promise<SendResult>;
    join: (body: JoinBody) => Promise<JoinResult>;
    detail: (part: DetailPart, opts?: DetailOptions) => Promise<DetailView | null>;
    personal: PersonalLook;
    setPersonal: (patch: Partial<PersonalLook>) => void;
    profile: Profile;
    setProfile: (patch: Partial<Profile>) => void;
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
