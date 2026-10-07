import {after} from "next/server";
import {TickSchema} from "@/lib/poker-night/input";
import {playerViewOf, unchangedOf} from "@/lib/poker-night/room-doc";
import {failed, fail, json, playerRequest} from "@/lib/poker-night/route-kit";
import {afterCommit, mutateRoom, stampSeen} from "@/lib/poker-night/store";

// The table's clock, with nothing on the server waking on a timer: the clock leader's page posts a
// tick when the head's nextDueAt passes (a turn running out, a run-out street, the next deal), the
// other seated pages a moment later as a fallback. A tick advances the room only when something is
// really due — racing ticks lose the compare-and-set, re-read and find nothing to do — and answers
// Unchanged otherwise. A visible page also beats every 25 s ({beat: {hidden}}), stamping its
// presence out of band (store.stampSeen, at most once per 15 s per player). Takes the seat pass.

export const runtime = 'nodejs';
export const maxDuration = 10;

export async function POST(request: Request, {params}: {params: Promise<{code: string}>}) {
    const ctx = await playerRequest(request, params, {bucket: 'post', allowPass: true, schema: TickSchema});
    if (!ctx.ok) return ctx.response;
    const pid = ctx.player.pid;
    try {
        if (ctx.body.beat) await stampSeen(ctx.ref, pid, ctx.body.beat.hidden, ctx.receivedAt);
        const now = Date.now();
        if (ctx.head.nextDueAt === null || ctx.head.nextDueAt > now) return json(unchangedOf(ctx.head, now, [], ctx.pass));
        const r = await mutateRoom(ctx.ref, null, {receivedAt: ctx.receivedAt, label: 'tick'});
        after(() => afterCommit(r));
        if (!r.ok) return fail(r.code);
        return json(playerViewOf(r.room, pid, {pass: ctx.pass}));
    } catch (error) {
        return failed('a tick failed', {code: ctx.code, env: ctx.env, seq: ctx.head.seq, actionType: 'tick'}, error);
    }
}
