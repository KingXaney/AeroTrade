// What every poker night route handler (app/api/poker-night/[code]/*/route.ts) shares: the responses
// it may send and the checks a request passes before any of them. Server-only (on the poker-night
// server guard's list); lib/poker-night/__tests__/route-guard.test.ts holds every route to calling
// playerRequest, and the pure checks it runs are lib/poker-night/http.ts.
//
// playerRequest, in order — the cheap refusals first, the database last:
// 1. the kill switch (POKER_NIGHT_ENABLED=false: 503), then the X-PN-Protocol header (426 'reload');
// 2. a POST: same origin, application/json, at most 2 KiB declared and read, strict zod;
// 3. the in-memory bucket, by the player a valid seat pass names on every route (so nobody behind
//    the same address — a guest on the household Wi-Fi, a carrier's NAT — can spend a seated
//    player's budget), else by the client's address — before any database call, so a loop of
//    requests costs no writes;
// 4. the code, normalised (a malformed one is a plain 404);
// 5. who is asking: the seat pass where the route takes one (no database), else the identity in full
//    (a failed session read is 503, never a guest; nobody at all is 401);
// 6. the room's head, one projected read (unknown: 404, and an unknown code costs the address one
//    Mongo miss counter on every route — a real client only sends a code it knows, so only a guess
//    pays, and no route checks codes faster than the counter allows; closed: 410);
// 7. the player: their row in the room (403 'not_player', or 'banned' once the host removed them).
//    A join asks for no row: it is how one is made.

import type {z} from "zod";
import {clientIpFrom} from "@/lib/auth/limits";
import {takeRateLimit} from "@/lib/rate-limit";
import {createBuckets} from "@/lib/poker-night/bucket";
import {normalizeCode} from "@/lib/poker-night/code";
import {envOf, pokerNightEnabled, type Env} from "@/lib/poker-night/env";
import type {GuestToken} from "@/lib/poker-night/guest-token";
import {
    declaredLengthOk, errorBody, errorStatus, jsonContentType, PASS_HEADER, protocolOk, readCappedText, sameOriginRequest, type PokerNightErrorCode,
} from "@/lib/poker-night/http";
import {readRequestIdentity} from "@/lib/poker-night/identity";
import {BUCKETS, bucketKey, LIMITS, pnKey, RATE_LIMITS, type BucketKind} from "@/lib/poker-night/limits";
import {passFor, passKey, passRenewalDue, verifyPass, type Pass} from "@/lib/poker-night/pass";
import {isBanned, isKnown, playerFor, type KnownIdentity, type PlayerIdentity, type PlayerKeys} from "@/lib/poker-night/room";
import type {RoomHead, RoomRef} from "@/lib/poker-night/room-doc";
import {readRoomHead} from "@/lib/poker-night/store";
import type {ResponseBody} from "@/lib/poker-night/view-types";

// Every response: never cached, by the browser or anything between.
const NO_STORE = {'Cache-Control': 'no-store'} as const;

// The only way a route answers: one of the client's own types (view-types.ResponseBody), so a
// server object — a room, a state, a document — does not compile here.
export const json = (body: ResponseBody, init: {status?: number} = {}): Response =>
    Response.json(body, {status: init.status ?? 200, headers: NO_STORE});

export const fail = (code: PokerNightErrorCode): Response => json(errorBody(code), {status: errorStatus(code)});

type LogFields = {code?: string | null; env: Env; seq?: number | null; actionType?: string; message: string};

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

// A route's last resort: the failure logged (codes and messages only) and a 503.
export const failed = (label: string, fields: Omit<LogFields, 'message'>, error: unknown): Response => {
    const logged: LogFields = {...fields, message: messageOf(error)};
    console.error(`poker night: ${label}`, logged);
    return fail('unavailable');
};

// Per server instance (bucket.ts): what catches a loop before it reaches the database.
const buckets: Record<BucketKind, ReturnType<typeof createBuckets>> = {
    get: createBuckets(BUCKETS.get),
    post: createBuckets(BUCKETS.post),
};

// A seat pass for player `pid`, good for LIMITS.passTtlMs; null when no key can be derived.
export const mintPass = (roomId: string, pid: string, now: number): string | null => {
    try {
        return passFor(passKey(), roomId, pid, now);
    } catch {
        return null;
    }
};

const readPass = (headers: Headers, now: number): Pass | null => {
    const raw = headers.get(PASS_HEADER);
    if (!raw) return null;
    try {
        return verifyPass(raw, passKey(), now);
    } catch {
        return null;
    }
};

type RequestOptions<B> = {
    bucket: BucketKind;
    // GET state, GET detail and POST tick take the seat pass in place of the identity; every route
    // keys its bucket by the player a valid pass names.
    allowPass: boolean;
    // A POST's body schema.
    schema?: z.ZodType<B>;
};

type Common<B> = {
    ok: true;
    env: Env;
    code: string;
    receivedAt: number; // when the request arrived: an action's time, whatever the CAS loop's retries
    ip: string | null;
    body: B;
    head: RoomHead;
    ref: RoomRef;
};

// A request from a player at the table. pass: a fresh seat pass when the identity was read in full or
// the one the request came with is past half its life, null otherwise.
export type PlayerContext<B> = Common<B> & {player: PlayerKeys; pass: string | null};

// A join: who is asking, if anyone (a guest cookie is minted for nobody), and the guest token their
// identity rests on (re-signed once old).
export type JoinContext<B> = Common<B> & {identity: Exclude<PlayerIdentity, {kind: 'unavailable'}>; guest: GuestToken | null};

export type Refused = {ok: false; response: Response};

const refuse = (code: PokerNightErrorCode): Refused => ({ok: false, response: fail(code)});

// A POST's body: JSON from the same origin, at most LIMITS.postBodyBytes declared and read (the
// read gives up past the cap), held to the route's strict schema when it has one.
export const readBody = async <B>(request: Request, schema?: z.ZodType<B>): Promise<{ok: true; body: B} | Refused> => {
    if (!sameOriginRequest(request.headers, request.url)) return refuse('cross_origin');
    if (!jsonContentType(request.headers) || !declaredLengthOk(request.headers)) return refuse('bad_request');
    const text = await readCappedText(request, LIMITS.postBodyBytes);
    if (text === null) return refuse('bad_request');
    let raw: unknown;
    try {
        raw = JSON.parse(text);
    } catch {
        return refuse('bad_request');
    }
    if (!schema) return {ok: true, body: raw as B};
    const parsed = schema.safeParse(raw);
    return parsed.success ? {ok: true, body: parsed.data} : refuse('bad_request');
};

// Steps 1–2: the request itself, before anything is read.
const checkRequest = async <B>(request: Request, opts: RequestOptions<B>): Promise<{ok: true; body: B} | Refused> => {
    if (!pokerNightEnabled()) return refuse('unavailable');
    if (!protocolOk(request.headers)) return refuse('reload');
    if (request.method === 'GET' || request.method === 'HEAD') return {ok: true, body: undefined as B};
    return readBody(request, opts.schema);
};

// The identity read in full, refused when unavailable (503) or, unless joining, absent (401).
const fullIdentity = async (env: Env, joining: boolean): Promise<{ok: true; identity: Exclude<PlayerIdentity, {kind: 'unavailable'}>; guest: GuestToken | null} | Refused> => {
    const {identity, guest} = await readRequestIdentity(env);
    if (identity.kind === 'unavailable') return refuse('unavailable');
    if (identity.kind === 'none' && !joining) return refuse('no_identity');
    return {ok: true, identity, guest};
};

// Step 6: the room's head by its code. An unknown one costs the address a miss, on every route.
const headFor = async (env: Env, code: string, ip: string | null): Promise<{ok: true; head: RoomHead} | Refused> => {
    const head = await readRoomHead(env, code);
    if (!head) {
        if (ip !== null && !(await takeRateLimit(pnKey.miss(env, ip), RATE_LIMITS.miss.limit, RATE_LIMITS.miss.windowMs))) {
            return refuse('rate_limited');
        }
        return refuse('not_found');
    }
    if (head.status === 'closed') return refuse('closed');
    return {ok: true, head};
};

// Step 7: the identity's row, unless the host removed it.
const rowFor = (head: RoomHead, identity: KnownIdentity): {ok: true; player: PlayerKeys} | Refused => {
    if (isBanned(head, identity)) return refuse('banned');
    const player = playerFor(head, identity);
    return player ? {ok: true, player} : refuse('not_player');
};

export function playerRequest<B = undefined>(request: Request, params: Promise<{code: string}>, opts: RequestOptions<B> & {joining: true}): Promise<JoinContext<B> | Refused>;
export function playerRequest<B = undefined>(request: Request, params: Promise<{code: string}>, opts: RequestOptions<B> & {joining?: false}): Promise<PlayerContext<B> | Refused>;
export async function playerRequest<B>(request: Request, params: Promise<{code: string}>, opts: RequestOptions<B> & {joining?: boolean}): Promise<PlayerContext<B> | JoinContext<B> | Refused> {
    const receivedAt = Date.now();
    const env = envOf();
    try {
        const checked = await checkRequest(request, opts);
        if (!checked.ok) return checked;
        const ip = clientIpFrom(request.headers);
        // A valid pass names the player's own bucket on every route; it stands in for the identity
        // only where the route takes it (never on join or action).
        const held = readPass(request.headers, receivedAt);
        if (!buckets[opts.bucket].take(bucketKey(env, opts.bucket, held ? {pid: held.pid} : {ip}), receivedAt)) return refuse('rate_limited');
        const pass = opts.allowPass && !opts.joining ? held : null;
        const code = normalizeCode((await params).code);
        if (code === null) return refuse('not_found');

        if (opts.joining) {
            const who = await fullIdentity(env, true);
            if (!who.ok) return who;
            const found = await headFor(env, code, ip);
            if (!found.ok) return found;
            const {head} = found;
            return {ok: true, env, code, receivedAt, ip, body: checked.body, head, ref: {env, id: head.id}, identity: who.identity, guest: who.guest};
        }

        // With a pass, who is asking is known without a read; the head says whether it still holds.
        const who = pass ? null : await fullIdentity(env, false);
        if (who && !who.ok) return who;
        const found = await headFor(env, code, ip);
        if (!found.ok) return found;
        const {head} = found;
        const common = {ok: true as const, env, code, receivedAt, ip, body: checked.body, head, ref: {env, id: head.id}};
        if (pass) {
            const row = pass.roomId === head.id ? head.players.find((p) => p.pid === pass.pid) : undefined;
            // Past half its life the pass is renewed, so a player who only polls never falls back
            // to the address's bucket when it lapses.
            if (row && !row.banned) return {...common, player: row, pass: passRenewalDue(pass, receivedAt) ? mintPass(head.id, row.pid, Date.now()) : null};
        }
        // No pass, or one this room no longer honours: the identity in full, and a fresh pass.
        const full = who ?? (await fullIdentity(env, false));
        if (!full.ok) return full;
        if (!isKnown(full.identity)) return refuse('no_identity');
        const row = rowFor(head, full.identity);
        if (!row.ok) return row;
        return {...common, player: row.player, pass: mintPass(head.id, row.player.pid, Date.now())};
    } catch (error) {
        return {ok: false, response: failed('a request could not be checked', {env}, error)};
    }
}
