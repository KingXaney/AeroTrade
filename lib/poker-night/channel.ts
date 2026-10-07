// Poker night's realtime channel, as both ends name it: the channel a room's updates go out on,
// what a browser's token may do on it, the messages, and whether this deployment has realtime at
// all. Pure and client-safe (realtimeEnabled reads only the record it is handed, process.env by
// default); lib/poker-night/realtime.ts is the server side that talks to Ably.
//
// - The channel names the env and the room's id, never its share code: a code is what a stranger
//   guesses, and a preview shares production's Ably app as it shares its database.
// - A token may only subscribe to that one channel: no client publishes, enters presence or reads
//   another table. Everything on it is public (the wire view, the emotes), so a removed player who
//   keeps a token until it expires learns nothing the table did not already show them.
// - A message carries an explicit id (the room and its seq, or the emote's), so a retried publish is
//   one message; a browser applies a state only when its seq is newer, so order and repeats never
//   matter.

import type {Env} from '@/lib/poker-night/env';
import type {EmoteView, WireView} from '@/lib/poker-night/view-types';

export const CHANNEL_NAMESPACE = 'poker-night';

// The channel of room `roomId` in `env`: poker-night:<env>:<roomId>.
export const channelName = (env: Env, roomId: string): string => `${CHANNEL_NAMESPACE}:${env}:${roomId}`;

// The one operation a browser's token grants, on its room's channel alone: never publish, never
// presence.
export const CAPABILITY = Object.freeze(['subscribe'] as const);

export const capabilityFor = (channel: string): Record<string, string[]> => ({[channel]: [...CAPABILITY]});

// The messages on a channel.
export const STATE_MESSAGE = 'state';
export const EMOTE_MESSAGE = 'emote';

// A state message, envelope and all, stays under this many bytes (Ably may count messages in 5 KiB
// chunks): lib/poker-night/__tests__/budget.test.ts measures it on the heaviest table the engine builds.
export const WIRE_BUDGET_BYTES = 4500;

export type StateMessage = {name: typeof STATE_MESSAGE; id: string; data: WireView};
export type EmoteMessage = {name: typeof EMOTE_MESSAGE; id: string; data: EmoteView};

// What goes on the channel after a commit: the public wire view, under an id that makes a retried
// publish idempotent.
export const stateMessage = (roomId: string, wire: WireView): StateMessage => ({name: STATE_MESSAGE, id: `${roomId}:${wire.seq}`, data: wire});

// An emote (P6), under its own id.
export const emoteMessage = (roomId: string, emote: EmoteView): EmoteMessage => ({name: EMOTE_MESSAGE, id: `${roomId}:e:${emote.id}`, data: emote});

type EnvVars = Readonly<Record<string, string | undefined>>;

// An Ably API key: "appId.keyId:secret".
const ABLY_KEY = /^[^.:\s]+\.[^.:\s]+:\S+$/;

// The Ably key this deployment has, or null for none or one that is not shaped like a key.
export const ablyKeyOf = (vars: EnvVars = process.env): string | null => {
    const key = vars.ABLY_API_KEY?.trim() ?? '';
    return ABLY_KEY.test(key) ? key : null;
};

// Whether tables here go live over Ably: a key shaped like one, and POKER_NIGHT_REALTIME not "off"
// (the kill switch that leaves the key in place). Without it every table polls.
export const realtimeEnabled = (vars: EnvVars = process.env): boolean =>
    vars.POKER_NIGHT_REALTIME?.trim().toLowerCase() !== 'off' && ablyKeyOf(vars) !== null;

// Whether a value read off the channel looks like a state message's data: a wire view with its seq
// and seats. Only the server can publish (every browser's token is subscribe-only), so this guards
// against a malformed message, not a forged one.
export const isWire = (value: unknown): value is WireView => {
    if (typeof value !== 'object' || value === null) return false;
    const wire = value as Partial<WireView>;
    return wire.v === 1 && Number.isSafeInteger(wire.seq) && Array.isArray(wire.seats) && typeof wire.code === 'string' && typeof wire.serverNow === 'number';
};
