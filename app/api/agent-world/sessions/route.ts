import {z} from 'zod';
import {agentWorldEnv, agentWorldOff, agentWorldService} from "@/lib/agent-world/env";
import {readSignedRequest} from "@/lib/agent-world/signing";
import {requestSession} from "@/lib/agent-world/wake";
import {takeRateLimit} from "@/lib/rate-limit";

// A session asked for from Paperclip: the company's "Weekly session" routine (or an Invoke) wakes
// the Head trader, whose address is the service; the service relays it here, signed with the
// shared secret. It becomes a manual session of the weekly job — its fills wait for the open — at
// most a few an hour, whatever Paperclip is told to do.

export const runtime = 'nodejs';
export const maxDuration = 10;

const RELAYS_PER_HOUR = 6;

const Relay = z.object({
    source: z.literal('paperclip'),
    paperclipRunId: z.string().max(120).nullish(),
    taskId: z.string().max(120).nullish(),
    wakeReason: z.string().max(60).nullish(),
    agentId: z.string().max(120).nullish(),
});

const json = (body: unknown, status = 200): Response => Response.json(body, {status, headers: {'Cache-Control': 'no-store'}});

export async function POST(request: Request) {
    const service = agentWorldService();
    if (!service) return json({error: 'unconfigured'}, 503);
    const read = await readSignedRequest(request, service.secret, {nowMs: Date.now(), max: 4096});
    if (!read.ok) return json({error: read.reason}, read.status);
    let raw: unknown;
    try {
        raw = JSON.parse(read.text);
    } catch {
        return json({error: 'invalid'}, 400);
    }
    const relay = Relay.safeParse(raw);
    if (!relay.success) return json({error: 'invalid'}, 400);
    const off = agentWorldOff();
    if (off) return json({error: 'off', reason: off}, 503);
    if (!(await takeRateLimit(`agent-world:sessions:${agentWorldEnv()}`, RELAYS_PER_HOUR, 3_600_000))) return json({error: 'rate-limited'}, 429);
    const queued = await requestSession({
        manual: true,
        source: 'paperclip',
        paperclip: {runId: relay.data.paperclipRunId ?? null, taskId: relay.data.taskId ?? null},
    });
    return json({queued}, queued ? 202 : 503);
}
