import {after} from "next/server";
import {peekRateLimit, takeRateLimit} from "@/lib/rate-limit";
import type {Env} from "@/lib/poker-night/env";
import {guestNeedsReissue, issueGuestCookie} from "@/lib/poker-night/identity";
import {JoinSchema} from "@/lib/poker-night/input";
import {counterSpent, pnKey, RATE_LIMITS} from "@/lib/poker-night/limits";
import {isBanned, joinStep, newPid, playerFor, type KnownIdentity} from "@/lib/poker-night/room";
import {playerViewOf} from "@/lib/poker-night/room-doc";
import {failed, fail, json, mintPass, playerRequest} from "@/lib/poker-night/route-kit";
import {afterCommit, mutateRoom} from "@/lib/poker-night/store";

// Sitting down, or watching: the one way a row is made at a table. Anyone with the link may join —
// an account, or a guest: a request with no identity at all is given the app's own guest cookie
// here (lib/poker-night/identity.issueGuestCookie), never a better-auth user — the guest the body's
// joinId names, so a double tap or a retry is one row. Idempotent per identity: a returning player
// is answered with their own view. A new identity spends the address's Mongo join counter, and is
// refused while the room's is used up; the room's counts only the rows joins made, spent after the
// answer, so joins the table turns down (locked, full, removed) cannot use it up and keep friends
// out. The step is lib/poker-night/room.joinStep: refused at a locked table, for a removed
// identity, or when the room is full; seated in the seat asked for, the next free one, or left
// watching when every seat is taken.

export const runtime = 'nodejs';
export const maxDuration = 10;

export async function POST(request: Request, {params}: {params: Promise<{code: string}>}) {
    const ctx = await playerRequest(request, params, {bucket: 'post', allowPass: false, schema: JoinSchema, joining: true});
    if (!ctx.ok) return ctx.response;
    try {
        // Nobody yet: the guest this join's id names, so a double tap or a retry after a lost answer
        // is one guest and one row. A guest whose token is old or signed with the previous key: the
        // same guest, re-signed. An account is left as it is, guest cookie and all.
        const identity: KnownIdentity = ctx.identity.kind === 'none'
            ? {kind: 'guest', ...(await issueGuestCookie(ctx.env, ctx.receivedAt, {joinId: ctx.body.joinId}))}
            : ctx.identity.kind === 'guest' && guestNeedsReissue(ctx.guest, ctx.receivedAt)
                ? {kind: 'guest', ...(await issueGuestCookie(ctx.env, ctx.receivedAt, {current: ctx.guest}))}
                : ctx.identity;
        const returning = playerFor(ctx.head, identity) !== null && !isBanned(ctx.head, identity);
        const roomKey = pnKey.joinRoom(ctx.env, ctx.head.id);
        if (!returning) {
            if (ctx.ip !== null && !(await takeRateLimit(pnKey.joinIp(ctx.env, ctx.ip), RATE_LIMITS.joinIp.limit, RATE_LIMITS.joinIp.windowMs))) {
                return fail('rate_limited');
            }
            if (counterSpent(await peekRateLimit(roomKey), RATE_LIMITS.joinRoom.limit)) return fail('rate_limited');
        }
        const r = await mutateRoom(ctx.ref, joinStep(ctx.body, identity, newPid()), {receivedAt: ctx.receivedAt, label: 'join'});
        // The hands and results the join's commit set off (a seated account's buy-in), and a row it
        // made counted against the room, after the answer.
        const made = r.ok && r.join?.created === true;
        after(async () => {
            await afterCommit(r);
            if (made) await countRoomJoin(roomKey, ctx.code, ctx.env);
        });
        if (!r.ok) return fail(r.code);
        if (!r.join) return fail('unavailable');
        const pass = mintPass(ctx.ref.id, r.join.pid, Date.now());
        return json({...playerViewOf(r.room, r.join.pid, {pass}), outcome: r.join.outcome, renamed: r.join.renamed});
    } catch (error) {
        return failed('a join failed', {code: ctx.code, env: ctx.env, seq: ctx.head.seq, actionType: 'join'}, error);
    }
}

// The room's join counter, spent for a row a join made. Never throws: the row is made, and a counter
// that could not be written costs the next joins nothing.
const countRoomJoin = async (key: string, code: string, env: Env): Promise<void> => {
    try {
        await takeRateLimit(key, RATE_LIMITS.joinRoom.limit, RATE_LIMITS.joinRoom.windowMs);
    } catch (error) {
        console.error('poker night: counting a join failed', {code, env, message: error instanceof Error ? error.message : String(error)});
    }
};
