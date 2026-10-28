import type {LiveAnswer} from "@/lib/agent-world/types";

// The floor's one request: GET /api/agent-world/live, naming what it already holds (the session,
// the version, the seq) so the answer carries only what moved. Never throws: a dropped connection,
// a 429 or a 5xx is a failed poll the reducer counts and backs off from.

export type LiveResult = {ok: true; body: LiveAnswer; receivedAt: number} | {ok: false; aborted: boolean; status: number};

export const getLive = async (held: {sid: string | null; version: number; seq: number}, signal: AbortSignal): Promise<LiveResult> => {
    const params = new URLSearchParams();
    if (held.sid) params.set('sid', held.sid);
    params.set('v', String(held.version));
    params.set('seq', String(held.seq));
    try {
        const response = await fetch(`/api/agent-world/live?${params.toString()}`, {
            cache: 'no-store',
            credentials: 'same-origin',
            headers: {Accept: 'application/json'},
            signal,
        });
        if (!response.ok) return {ok: false, aborted: false, status: response.status};
        return {ok: true, body: await response.json() as LiveAnswer, receivedAt: Date.now()};
    } catch (error) {
        return {ok: false, aborted: (error as Error)?.name === 'AbortError', status: 0};
    }
};
