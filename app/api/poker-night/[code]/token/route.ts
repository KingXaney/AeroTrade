import {takeRateLimit} from "@/lib/rate-limit";
import {realtimeEnabled} from "@/lib/poker-night/channel";
import {pnKey, RATE_LIMITS} from "@/lib/poker-night/limits";
import {issueToken} from "@/lib/poker-night/realtime";
import {failed, fail, json, playerRequest} from "@/lib/poker-night/route-kit";

// The table's realtime token: a player's browser asks for one when the table opens and whenever
// Ably needs a fresh one (its authCallback). Without realtime here — no ABLY_API_KEY, one not shaped
// like a key, or POKER_NIGHT_REALTIME=off — the answer is {realtime: false} and the table polls.
// Otherwise the room's channel (poker-night:<env>:<room id>, never the code) and an Ably token for
// it: subscribe only, fifteen minutes, the player's pid as its clientId, so no browser publishes,
// enters presence or reads another table (lib/poker-night/channel). A removed player is refused
// here like everywhere, and keeps only what the channel shows everyone until their token runs out.
// A Mongo counter per player (RATE_LIMITS.token) bounds the Ably requests one player can cause.
// Never writes the room; takes the seat pass.

export const runtime = 'nodejs';
export const maxDuration = 10;

export async function GET(request: Request, {params}: {params: Promise<{code: string}>}) {
    const ctx = await playerRequest(request, params, {bucket: 'get', allowPass: true});
    if (!ctx.ok) return ctx.response;
    if (!realtimeEnabled()) return json({realtime: false});
    try {
        if (!(await takeRateLimit(pnKey.token(ctx.env, ctx.player.pid), RATE_LIMITS.token.limit, RATE_LIMITS.token.windowMs))) {
            return fail('rate_limited');
        }
        return json(await issueToken(ctx.env, ctx.ref.id, ctx.player.pid));
    } catch (error) {
        return failed('issuing a realtime token failed', {code: ctx.code, env: ctx.env, seq: ctx.head.seq, actionType: 'token'}, error);
    }
}
