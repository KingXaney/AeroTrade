import {readHand, readHands} from "@/lib/poker-night/hands-store";
import {parseDetailQuery} from "@/lib/poker-night/input";
import {failed, fail, json, playerRequest} from "@/lib/poker-night/route-kit";
import {unreadRefusal} from "@/lib/poker-night/room-doc";
import {getRoomById} from "@/lib/poker-night/store";
import {bankDetailView, handLogView, historyView} from "@/lib/poker-night/views";

// What the table's drawers open, read only when they open so the poll and the realtime message stay
// small: ?part=log&hand=n — a hand's whole log (the current one by default, an earlier one from
// history); ?part=history&before=n — a page of completed hands, a hole card only where it was shown
// or is the viewer's own; ?part=bank — every player's figures and latest events. Never writes; takes
// the seat pass.

export const runtime = 'nodejs';
export const maxDuration = 10;

export async function GET(request: Request, {params}: {params: Promise<{code: string}>}) {
    const ctx = await playerRequest(request, params, {bucket: 'get', allowPass: true});
    if (!ctx.ok) return ctx.response;
    const query = parseDetailQuery(new URL(request.url).searchParams);
    if (!query) return fail('bad_request');
    try {
        if (query.part === 'history') {
            const hands = await readHands(ctx.ref, query.before);
            return json({part: 'history', hands: hands.map((summary) => historyView(summary, ctx.player.pid))});
        }
        const read = await getRoomById(ctx.ref);
        if (!read.ok) return fail(unreadRefusal(read.why));
        const state = read.room.core.state;
        if (query.part === 'bank') return json({part: 'bank', bank: bankDetailView(state)});
        if (query.hand === null || query.hand === state.hand?.no) return json({part: 'log', hand: state.hand?.no ?? null, log: handLogView(state)});
        const summary = await readHand(ctx.ref, query.hand);
        if (!summary) return fail('not_found');
        return json({part: 'log', hand: summary.no, log: historyView(summary, ctx.player.pid).log});
    } catch (error) {
        return failed('reading a table detail failed', {code: ctx.code, env: ctx.env, seq: ctx.head.seq, actionType: query.part}, error);
    }
}
