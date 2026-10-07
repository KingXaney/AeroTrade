import {parseStateQuery} from "@/lib/poker-night/input";
import {playerViewOf, unchangedOf, unchangedOfRoom, unreadRefusal} from "@/lib/poker-night/room-doc";
import {failed, fail, json, playerRequest} from "@/lib/poker-night/route-kit";
import {getRoomById} from "@/lib/poker-night/store";

// A player's view of the table: the poll the table runs when realtime is off or stalled, and the
// one fetch after a realtime message says a new hand or seat needs their own cards. Never writes
// the room — the clock moves only on a POST (tick, action) — so a link preview, a prefetch or a
// loop of polls cannot deal a hand. ?since=<seq>&esince=<emoteSeq> name what the client already
// has: when neither moved the answer is Unchanged from the head's projection alone, no state read.
// Takes the seat pass (X-PN-Pass) in place of the session; mints one when it read the identity. A
// state a newer deploy wrote answers 426 reload, never closed.

export const runtime = 'nodejs';
export const maxDuration = 10;

export async function GET(request: Request, {params}: {params: Promise<{code: string}>}) {
    const ctx = await playerRequest(request, params, {bucket: 'get', allowPass: true});
    if (!ctx.ok) return ctx.response;
    try {
        const {since, esince} = parseStateQuery(new URL(request.url).searchParams);
        if (since === ctx.head.seq && esince === ctx.head.emoteSeq) return json(unchangedOf(ctx.head, Date.now(), [], ctx.pass));
        const read = await getRoomById(ctx.ref);
        if (!read.ok) return fail(unreadRefusal(read.why));
        const {room} = read;
        if (since === room.seq) return json(unchangedOfRoom(room, esince, ctx.pass));
        return json(playerViewOf(room, ctx.player.pid, {pass: ctx.pass}));
    } catch (error) {
        return failed('reading the table failed', {code: ctx.code, env: ctx.env, seq: ctx.head.seq}, error);
    }
}
