import {EVENT_BODY_BYTES} from "@/lib/agent-world/config";
import {agentWorldEnv, agentWorldService} from "@/lib/agent-world/env";
import {parseBatch} from "@/lib/agent-world/events";
import {readSignedRequest} from "@/lib/agent-world/signing";
import {applyEventBatch} from "@/lib/agent-world/store";
import {wakeOnFinished} from "@/lib/agent-world/wake";
import {JOBS} from "@/lib/jobs/registry";
import {isLimitProviderId} from "@/lib/limits/registry";
import {reportLimit} from "@/lib/limits/report";

// The trading agent world service's events (services/agent-world's emitter): one signed batch at a
// time, in seq order. proxy.ts leaves /api alone, so the signature is this route's only gate: an
// unsigned, stale or forged post is a 401 before anything is read into Mongo; an oversized one a
// 413 before it is read at all. Every event is read as untrusted (lib/agent-world/events.ts) and
// written under a seq guard, so a retried batch changes nothing. The answer tells the service
// whether to retry: 2xx done, 4xx never again, 5xx later.

export const runtime = 'nodejs'; // mongoose and node:crypto need Node, not edge
export const maxDuration = 20;

const json = (body: unknown, status = 200): Response => Response.json(body, {status, headers: {'Cache-Control': 'no-store'}});

export async function POST(request: Request) {
    const service = agentWorldService();
    if (!service) return json({error: 'unconfigured'}, 503);
    const read = await readSignedRequest(request, service.secret, {nowMs: Date.now(), max: EVENT_BODY_BYTES});
    if (!read.ok) return json({error: read.reason}, read.status);

    let raw: unknown;
    try {
        raw = JSON.parse(read.text);
    } catch {
        return json({error: 'invalid'}, 400);
    }
    const batch = parseBatch(raw);
    if (!batch.ok) return json({error: 'invalid'}, 400);

    try {
        const result = await applyEventBatch(agentWorldEnv(), batch.sessionId, batch.events);
        if (result.status === 'unknown-session') return json({error: 'unknown-session'}, 404);
        if (result.status === 'busy') return json({error: 'busy'}, 503);
        for (const limit of result.limits) {
            if (isLimitProviderId(limit.provider)) {
                await reportLimit(limit.provider, {status: limit.status, message: `${limit.symbol ?? 'session'}: ${limit.message}`}, JOBS.agentWorldWeekly.id);
            }
        }
        // Written first, woken second: a wake-up lost here costs the job one round of waiting.
        const woken = result.finished ? await wakeOnFinished(batch.sessionId, result.finished) : null;
        return json({applied: result.applied, stale: result.stale, invalid: batch.invalid, seq: result.seq, woken});
    } catch (error) {
        console.error('agent world events: batch not applied', {sessionId: batch.sessionId, events: batch.events.length, error: (error as Error).message});
        return json({error: 'unavailable'}, 503);
    }
}
