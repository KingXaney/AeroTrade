// Poker night's side of Ably: the server publishes, browsers only subscribe. Server-only — the
// key is the app's — and on the poker-night server guard's list, so no client file reaches it; the
// browser's half is components/poker-night/realtime-client, over 'ably/modular' alone. What the
// channel, the token and the messages are is lib/poker-night/channel (pure, tested).
//
// One Ably.Rest per key, built on first use from a dynamic import, so nothing is constructed (or
// loaded) at import time: a build, CI and a deployment without ABLY_API_KEY never touch the package,
// and a GET that never publishes never loads it. Without a key, or with POKER_NIGHT_REALTIME=off,
// every call here is a no-op answer: tables poll.
//
// Nothing here logs: a failure comes back as a message, and the caller (lib/poker-night/store's
// afterCommit) logs it with the room's code and seq and marks the room's realtime as failing.

import type * as AblyTypes from "ably";
import {ablyKeyOf, capabilityFor, channelName, emoteMessage, realtimeEnabled, stateMessage, type EmoteMessage, type StateMessage} from "@/lib/poker-night/channel";
import type {Env} from "@/lib/poker-night/env";
import {LIMITS} from "@/lib/poker-night/limits";
import type {EmoteView, TokenReply, WireView} from "@/lib/poker-night/view-types";

type EnvVars = Readonly<Record<string, string | undefined>>;

// A request to Ably gives up after this long, and retries within this much: a publish runs in the
// route's after(), inside the function's ten seconds.
const HTTP_TIMEOUT_MS = 3000;
const HTTP_RETRY_WINDOW_MS = 5000;

let client: {key: string; rest: Promise<AblyTypes.Rest>} | null = null;

const restFor = (key: string): Promise<AblyTypes.Rest> => {
    if (client === null || client.key !== key) {
        const rest = import("ably").then(({Rest}) => new Rest({
            key,
            // The ids are ours (channel.stateMessage), so a retried publish is still one message.
            idempotentRestPublishing: true,
            httpRequestTimeout: HTTP_TIMEOUT_MS,
            httpMaxRetryDuration: HTTP_RETRY_WINDOW_MS,
            // Silent: the caller logs a failure with codes and seqs only, never a message's data.
            logLevel: 0,
        }));
        // A failed load is not kept: the next call tries again.
        rest.catch(() => {
            if (client?.rest === rest) client = null;
        });
        client = {key, rest};
    }
    return client.rest;
};

// The configured client, or null when this deployment has no realtime.
const restOf = (vars: EnvVars): Promise<AblyTypes.Rest> | null => {
    const key = ablyKeyOf(vars);
    return key !== null && realtimeEnabled(vars) ? restFor(key) : null;
};

export type PublishResult = {ok: true; sent: boolean} | {ok: false; message: string};

const messageOf = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    if (typeof error === 'object' && error !== null && typeof (error as {message?: unknown}).message === 'string') return (error as {message: string}).message;
    return String(error);
};

const publish = async (env: Env, roomId: string, message: StateMessage | EmoteMessage, vars: EnvVars): Promise<PublishResult> => {
    const rest = restOf(vars);
    if (rest === null) return {ok: true, sent: false};
    try {
        await (await rest).channels.get(channelName(env, roomId)).publish(message);
        return {ok: true, sent: true};
    } catch (error) {
        return {ok: false, message: messageOf(error)};
    }
};

// A commit's public wire view, as the 'state' message on the room's channel. Never the people,
// a hole card, the deck, a viewer's own part or the config: the wire view has none of them.
export const publishWire = (env: Env, roomId: string, wire: WireView, vars: EnvVars = process.env): Promise<PublishResult> =>
    publish(env, roomId, stateMessage(roomId, wire), vars);

// An emote, as the 'emote' message (P6's route sends it once the emote is written).
export const publishEmote = (env: Env, roomId: string, emote: EmoteView, vars: EnvVars = process.env): Promise<PublishResult> =>
    publish(env, roomId, emoteMessage(roomId, emote), vars);

// A token for player `pid` on room `roomId`'s channel: subscribe only, LIMITS.tokenTtlMs long, the
// pid as its clientId. Ably's TokenDetails are copied field by field, so nothing else of the
// library's object reaches a response. Throws when Ably cannot be reached (the route answers 503).
export const issueToken = async (env: Env, roomId: string, pid: string, vars: EnvVars = process.env): Promise<TokenReply> => {
    const rest = restOf(vars);
    if (rest === null) return {realtime: false};
    const channel = channelName(env, roomId);
    const details = await (await rest).auth.requestToken({clientId: pid, capability: JSON.stringify(capabilityFor(channel)), ttl: LIMITS.tokenTtlMs});
    return {
        realtime: true,
        channel,
        token: {token: details.token, expires: details.expires, issued: details.issued, capability: details.capability, clientId: details.clientId ?? pid},
    };
};
