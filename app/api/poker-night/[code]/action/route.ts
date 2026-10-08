import {after} from "next/server";
import {ActionSchema, type ActionInput} from "@/lib/poker-night/input";
import {resolveTableLook} from "@/lib/poker-night/looks";
import {saveTableLook} from "@/lib/poker-night/prefs-store";
import {actionStep} from "@/lib/poker-night/room";
import {playerViewOf} from "@/lib/poker-night/room-doc";
import {failed, fail, json, playerRequest} from "@/lib/poker-night/route-kit";
import {afterCommit, mutateRoom} from "@/lib/poker-night/store";

// Every move a player makes at the table: a bet or a fold, a pre-action, a seat, a buy, leaving,
// showing, a new name or look, and the host's operations — removing a player and letting them back
// in among them (lib/poker-night/room.actionStep). The identity is read in full, never from the
// seat pass. The action's time is when the request arrived, so a move made in time is never beaten
// by a timeout that fell due while it waited. Every body carries an actionId the client reuses on a
// retry: the room keeps the last 40 it applied, so a double tap or a retried request is one action,
// answered with duplicate: true. When a signed-in host changes the scene or the felt, their new
// tables open with it too (lib/poker-night/prefs-store.saveTableLook, after the answer).

// The host's change of scene or felt.
const changesLook = (body: ActionInput): boolean =>
    body.type === 'host' && body.op.op === 'settings' && (body.op.patch.scene !== undefined || body.op.patch.felt !== undefined);

export const runtime = 'nodejs';
export const maxDuration = 10;

export async function POST(request: Request, {params}: {params: Promise<{code: string}>}) {
    const ctx = await playerRequest(request, params, {bucket: 'post', allowPass: false, schema: ActionSchema});
    if (!ctx.ok) return ctx.response;
    const pid = ctx.player.pid;
    try {
        const r = await mutateRoom(ctx.ref, actionStep(ctx.body, pid), {receivedAt: ctx.receivedAt, pid, actionId: ctx.body.actionId, label: ctx.body.type});
        // The hands it completed, the results it moved; P4's realtime publish joins them there.
        after(() => afterCommit(r));
        if (!r.ok) return fail(r.code);
        const userId = ctx.player.userId;
        if (userId !== null && r.changed && !r.duplicate && changesLook(ctx.body)) {
            const look = resolveTableLook(r.room.core.state.settings);
            after(() => saveTableLook(userId, look));
        }
        return json(playerViewOf(r.room, pid, {pass: ctx.pass, duplicate: r.duplicate}));
    } catch (error) {
        return failed('an action failed', {code: ctx.code, env: ctx.env, seq: ctx.head.seq, actionType: ctx.body.type}, error);
    }
}
