import {parseStateQuery} from "@/lib/poker-night/input";
import {nudgeOf, playerViewOf, unchangedOf, unchangedOfRoom, unreadRefusal} from "@/lib/poker-night/room-doc";
import {failed, fail, json, playerRequest} from "@/lib/poker-night/route-kit";
import {getRoomById} from "@/lib/poker-night/store";

// A player's view of the table: the poll the table runs when realtime is off or stalled, and the
// one fetch after a realtime message says a new hand or seat needs their own cards (or a nudge says
// their own view changed). Never writes the room — the clock moves only on a POST (tick, action) —
// so a link preview, a prefetch or a loop of polls cannot deal a hand. ?since=<seq>&esince=
// <emoteSeq>&nsince=<nudge> name what the client already has: when none moved — the public seq, the
// emote seq, the viewer's own nudge count (a poll that names none asks only after the table) — the
// answer is Unchanged from the head's projection alone, no state read.
// Takes the seat pass (X-PN-Pass) in place of the session; mints one when it read the identity. A
// state a newer deploy wrote answers 426 reload, never closed.

export const runtime = 'nodejs';
export const maxDuration = 10;

export async function GET(request: Request, {params}: {params: Promise<{code: string}>}) {
    const ctx = await playerRequest(request, params, {bucket: 'get', allowPass: true});
    if (!ctx.ok) return ctx.response;
    try {
        const pid = ctx.player.pid;
        const {since, esince, nsince} = parseStateQuery(new URL(request.url).searchParams);
        const nudged = (count: number) => nsince !== null && nsince !== count;
        if (since === ctx.head.seq && esince === ctx.head.emoteSeq && !nudged(nudgeOf(ctx.head.players, pid))) {
            return json(unchangedOf(ctx.head, Date.now(), [], ctx.pass, pid));
        }
        const read = await getRoomById(ctx.ref);
        if (!read.ok) return fail(unreadRefusal(read.why));
        const {room} = read;
        if (since === room.seq && !nudged(nudgeOf(room.core.players, pid))) return json(unchangedOfRoom(room, esince, ctx.pass, pid));
        return json(playerViewOf(room, pid, {pass: ctx.pass}));
    } catch (error) {
        return failed('reading the table failed', {code: ctx.code, env: ctx.env, seq: ctx.head.seq}, error);
    }
}
