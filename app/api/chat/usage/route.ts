import {getCurrentUserId} from "@/lib/auth/session";
import {chatErrorBody, chatErrorStatus} from "@/lib/chat/errors";
import {readChatUsage} from "@/lib/chat/usage-store";

// What is left of the chat's rate-limit windows for the signed-in reader, read without spending
// one (lib/chat/usage-store.readChatUsage): the panel fetches it on open and after each request
// settles, and the counts move only through app/api/chat/route.ts's takeRateLimit calls. proxy.ts
// leaves /api alone, so a signed-out call gets the chat's own 401 body from here.

export const runtime = 'nodejs'; // mongoose + better-auth need Node, not edge

// A GET handler is dynamic by default and this one reads the session's headers; the header keeps
// the browser from caching a count that moves with every message.
const NO_STORE = {'Cache-Control': 'no-store'};

export async function GET() {
    const userId = await getCurrentUserId();
    if (!userId) {
        return Response.json(chatErrorBody('unauthorized'), {status: chatErrorStatus('unauthorized'), headers: NO_STORE});
    }
    return Response.json(await readChatUsage(userId), {headers: NO_STORE});
}
