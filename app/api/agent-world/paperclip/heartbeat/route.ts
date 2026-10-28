import {agentWorldHeartbeatSecret} from "@/lib/agent-world/env";
import {HEARTBEAT_HEADER, readCappedBody, sameText} from "@/lib/agent-world/signing";

// The Execution desk's address in the Paperclip company (its http adapter posts here when it is
// woken: the session's issue reached its approval stage, a comment named it, an Invoke). The desk
// acts only through the owner's Approve and Decline on /agent-world, so a wake is answered — a 2xx
// is what Paperclip counts as delivered — and logged, never acted on. The shared header is the gate.

export const runtime = 'nodejs';
export const maxDuration = 10;

const json = (body: unknown, status = 200): Response => Response.json(body, {status, headers: {'Cache-Control': 'no-store'}});

export async function POST(request: Request) {
    const secret = agentWorldHeartbeatSecret();
    if (!secret) return json({error: 'unconfigured'}, 503);
    const presented = request.headers.get(HEARTBEAT_HEADER) ?? '';
    if (!presented || !sameText(presented, secret)) return json({error: 'unauthorized'}, 401);
    const read = await readCappedBody(request, 16_384);
    if (!read.ok) return json({error: read.reason}, read.reason === 'too-large' ? 413 : 400);
    let wake: {agentId?: unknown; runId?: unknown; context?: {wakeReason?: unknown; taskId?: unknown}} = {};
    try {
        wake = JSON.parse(read.text || '{}');
    } catch {
        return json({error: 'invalid'}, 400);
    }
    const text = (value: unknown): string | null => (typeof value === 'string' ? value.slice(0, 80) : null);
    console.info('agent world: Execution desk woken', {
        agentId: text(wake.agentId),
        runId: text(wake.runId),
        wakeReason: text(wake.context?.wakeReason),
        taskId: text(wake.context?.taskId),
    });
    return json({ok: true});
}
