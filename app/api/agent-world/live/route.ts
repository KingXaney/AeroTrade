import {takeToken, type Bucket} from "@/lib/agent-world/bucket";
import {agentWorldEnv} from "@/lib/agent-world/env";
import {SESSION_ID} from "@/lib/agent-world/events";
import {getLiveView} from "@/lib/agent-world/store";
import {getCurrentUserId} from "@/lib/auth/session";

// What the floor polls (components/agent-world/useLiveFeed): the newest session, or only what the
// poll does not already hold — nothing at all when its version matches, the session and the runs
// past its seq when it names this session. Signed-in readers only (proxy.ts leaves /api alone), and
// a reader's polls are metered per instance so a runaway tab costs a 429, not database reads.

export const runtime = 'nodejs';
export const maxDuration = 10;

const NO_STORE = {'Cache-Control': 'no-store'};
const buckets = new Map<string, Bucket>();
// A tab polls every three seconds at most; two tabs and a refresh fit well inside this.
const RATE = {rate: 2, burst: 12};

const intOrNull = (value: string | null): number | null => {
    if (value === null || !/^\d{1,9}$/.test(value)) return null;
    return Number(value);
};

export async function GET(request: Request) {
    const userId = await getCurrentUserId();
    if (!userId) return Response.json({error: 'unauthorized'}, {status: 401, headers: NO_STORE});
    if (!takeToken(buckets, userId, Date.now(), RATE)) return Response.json({error: 'rate-limited'}, {status: 429, headers: NO_STORE});

    const params = new URL(request.url).searchParams;
    const rawSid = params.get('sid');
    const sid = rawSid && SESSION_ID.safeParse(rawSid).success ? rawSid : null;
    try {
        const answer = await getLiveView(agentWorldEnv(), {sid, version: intOrNull(params.get('v')), seq: intOrNull(params.get('seq'))});
        return Response.json(answer, {headers: NO_STORE});
    } catch (error) {
        console.error('agent world live: read failed', (error as Error).message);
        return Response.json({error: 'unavailable'}, {status: 503, headers: NO_STORE});
    }
}
