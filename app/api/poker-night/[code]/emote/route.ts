import {after} from "next/server";
import {checkEmote, EMOTE_COOLDOWN_MS, EMOTE_REFUSALS, emoteOut, parseEmote} from "@/lib/poker-night/emotes";
import {EmoteSchema} from "@/lib/poker-night/input";
import {newPid} from "@/lib/poker-night/room";
import {failed, fail, json, playerRequest} from "@/lib/poker-night/route-kit";
import {publishEmoteAfter, pushEmote, readEmoteTable} from "@/lib/poker-night/store";

// An emote from a seated player: a reaction, a phrase (an id, never free text) or something thrown
// at another seated player. Takes the seat pass, like a poll. Out of band: it never touches the
// game's compare-and-set, so a tomato never costs a bet its race.
//
// In order: the body (strict: lib/poker-night/input EmoteSchema, then emotes.parseEmote); who is in
// a seat and whether the host has throwables on, from one projected read; emotes.checkEmote (a
// watcher is refused not_seated, a throw with throwables off 403 forbidden, a throw at nobody or at
// oneself invalid_action); then one conditional write (store.pushEmote, room-doc.emoteWrite) whose
// filter is the sender's 1.2-second cooldown, from the time each request arrived (route-kit's
// receivedAt) — inside it the write matches nothing and the answer is 429 rate_limited, with no
// counter written. The answer is the emote as stored, so the sender's own table draws it at once;
// after() puts it on the realtime channel for everyone else (polls carry it too, by the room's
// emoteSeq).

export const runtime = 'nodejs';
export const maxDuration = 10;

export async function POST(request: Request, {params}: {params: Promise<{code: string}>}) {
    const ctx = await playerRequest(request, params, {bucket: 'post', allowPass: true, schema: EmoteSchema});
    if (!ctx.ok) return ctx.response;
    const pid = ctx.player.pid;
    try {
        const input = parseEmote(ctx.body);
        if (!input) return fail('bad_request');
        const table = await readEmoteTable(ctx.ref);
        if (!table) return fail('not_found');
        if (table.closed) return fail('closed');
        const verdict = checkEmote(input, {from: pid, seated: table.seated, throwables: table.throwables});
        if (verdict !== 'ok') return fail(EMOTE_REFUSALS[verdict]);
        // Stamped with the time the request arrived, not after the reads: a slow read on one request
        // and a quick one on the next never puts the stamp later than the click the cooldown starts
        // from (emote-client.sendEmoteNow), so a second emote the picker allows is never refused.
        const now = ctx.receivedAt;
        const pushed = await pushEmote(ctx.ref, {...input, id: newPid(), from: pid, at: now}, {now, cooldownMs: EMOTE_COOLDOWN_MS});
        if (!pushed.ok) return fail('rate_limited');
        const emote = emoteOut(pushed.emote);
        after(() => publishEmoteAfter(ctx.ref, ctx.code, emote));
        return json({ok: true, emoteSeq: pushed.emoteSeq, emote});
    } catch (error) {
        return failed('an emote failed', {code: ctx.code, env: ctx.env, seq: ctx.head.seq, actionType: 'emote'}, error);
    }
}
