import {Document, model, models, Schema} from "mongoose";
import {ENVS, type Env} from "@/lib/poker-night/env";
import type {TableState, TableStatus} from "@/lib/poker-night/types";

// One poker night table: the engine's state, who is at it, and the bookkeeping around both. Read
// and written only by lib/poker-night/store.ts — mutateRoom's compare-and-set on `seq` is the one
// way the game moves; the out-of-band fields below are written beside it, never through it.
//
// PRIVATE, never sent to a browser as stored: the state's deck, every hole card and pre-action;
// the players' userId and guestId; bannedKeys and applied. Every client payload is built by
// lib/poker-night/views.ts and lib/poker-night/room.ts.
//
// Every query filters `env` (lib/poker-night/env): a preview build shares production's database.
// Every read also filters `expiresAt > now`, because the TTL monitor runs late.
export interface PokerRoomPlayerDoc {
    pid: string;              // 11 characters of base64url: the only public handle
    userId: string | null;    // PRIVATE: an account
    guestId: string | null;   // PRIVATE: the app's own guest cookie (lib/poker-night/guest-token)
    name: string;
    avatar: string;           // 'v1:fox:tangerine:ring:crown' (lib/poker-night/avatar)
    joinedAt: Date;
    banned: boolean;          // removed by the host until let back in
}

export interface PokerRoomDoc extends Document {
    env: Env;
    code: string;             // 6 characters of lib/poker-night/code's alphabet, unique per env
    // Mirrors of the state for queries (lib/poker-night/room.mirrorsOf), written in the same CAS.
    name: string;
    hostUserId: string;
    status: TableStatus;
    seatCount: number;
    seatsTaken: number;
    showToFriends: boolean;
    nextDueAt: Date | null;   // when the clock next has something to do: GET state and tick read it cheaply
    seq: number;              // +1 per committed write: the public version and the CAS guard
    peopleV: number;          // the version of everyone's names and looks (lib/poker-night/room)
    state: TableState;        // Mixed, migrated on every read (lib/poker-night/migrate)
    players: PokerRoomPlayerDoc[];
    bannedKeys?: string[];    // PRIVATE: 'u:<userId>' | 'g:<guestId>'
    applied: string[];        // PRIVATE: the last KEEP.APPLIED keys of applied action ids (room.appliedKey)
    // ── out of band: never $set by mutateRoom ──
    seen: Record<string, {at: number; hidden: boolean}>;   // presence beats by pid, at in ms
    emotes: unknown[];        // the last KEEP.EMOTES emotes (P6)
    emoteSeq: number;
    emoteAt?: Record<string, number>;                      // PRIVATE: each pid's last emote (P6)
    awards?: Record<string, unknown>;                      // thrown and received counts (P7)
    rt?: {failAt: Date; fails: number};                    // realtime publish failures (P4)
    lastError?: {at: Date; kind: string; seq: number};     // the last failure, kept past the logs' hour
    lastActivityAt: Date;     // every commit; idle for TIMING.IDLE_CLOSE_MS closes the table
    closedAt: Date | null;
    expiresAt: Date;          // TTL: a week past the last commit, or past the close
    createdAt: Date;
    updatedAt: Date;
}

const PokerRoomPlayerSchema = new Schema<PokerRoomPlayerDoc>(
    {
        pid: {type: String, required: true},
        userId: {type: String, default: null},
        guestId: {type: String, default: null},
        name: {type: String, required: true},
        avatar: {type: String, required: true},
        joinedAt: {type: Date, required: true},
        banned: {type: Boolean, required: true, default: false},
    },
    {_id: false},
);

const PokerRoomSchema = new Schema<PokerRoomDoc>(
    {
        env: {type: String, required: true, enum: [...ENVS]},
        code: {type: String, required: true},
        name: {type: String, default: ''},
        hostUserId: {type: String, required: true},
        status: {type: String, required: true, enum: ['open', 'playing', 'paused', 'closed']},
        seatCount: {type: Number, required: true},
        seatsTaken: {type: Number, required: true, default: 0},
        showToFriends: {type: Boolean, required: true, default: false},
        nextDueAt: {type: Date, default: null},
        seq: {type: Number, required: true, default: 0},
        peopleV: {type: Number, required: true, default: 1},
        state: {type: Schema.Types.Mixed, required: true},
        players: {type: [PokerRoomPlayerSchema], default: []},
        bannedKeys: {type: [String], default: undefined},
        applied: {type: [String], default: []},
        seen: {type: Schema.Types.Mixed, default: {}},
        emotes: {type: [Schema.Types.Mixed], default: []},
        emoteSeq: {type: Number, required: true, default: 0},
        emoteAt: {type: Schema.Types.Mixed, default: undefined},
        awards: {type: Schema.Types.Mixed, default: undefined},
        rt: {type: new Schema({failAt: {type: Date, required: true}, fails: {type: Number, required: true}}, {_id: false}), default: undefined},
        lastError: {
            type: new Schema({at: {type: Date, required: true}, kind: {type: String, required: true}, seq: {type: Number, required: true}}, {_id: false}),
            default: undefined,
        },
        lastActivityAt: {type: Date, required: true},
        closedAt: {type: Date, default: null},
        expiresAt: {type: Date, required: true},
    },
    // minimize:false keeps empty objects in the state (an empty `seen`, a settings patch) as written.
    {timestamps: true, minimize: false},
);

// The share code, per env: a repeat on insert draws again (store.insertRoom).
PokerRoomSchema.index({env: 1, code: 1}, {unique: true});
PokerRoomSchema.index({expiresAt: 1}, {expireAfterSeconds: 0});
// A host's open tables, newest first: the open-table cap and the lobby's "Your open tables".
PokerRoomSchema.index({env: 1, hostUserId: 1, status: 1, lastActivityAt: -1});
// Friends' open tables, shown only when the host chose to.
PokerRoomSchema.index({env: 1, hostUserId: 1, showToFriends: 1, status: 1});
// The tables an account plays at.
PokerRoomSchema.index({env: 1, 'players.userId': 1, status: 1});

const PokerRoom = models?.PokerRoom || model<PokerRoomDoc>('PokerRoom', PokerRoomSchema);

export default PokerRoom;
