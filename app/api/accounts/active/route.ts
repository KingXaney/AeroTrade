import {NextResponse} from "next/server";
import {getCurrentUserId} from "@/lib/auth/session";
import {sameOriginRequest} from "@/lib/same-origin";
import {getOwnedAccount} from "@/lib/trading/accounts";
import {setActiveAccountCookie} from "@/lib/trading/active-cookie";
import {SWITCH_COPY} from "@/lib/learn/copy/portfolio";
import type {ActionResult} from "@/lib/actions/types";

export const runtime = 'nodejs';   // mongoose + better-auth need Node, not edge

const answer = (body: ActionResult, status: number) => NextResponse.json(body, {status});

// Makes one of the caller's own paper accounts the active one: the account switcher's and the
// comparison table's write (components/trading/accounts/useSwitchAccount.ts).
//
// A route handler, not a server action, on purpose. A server action that sets a cookie makes
// Next re-render the current page inside the action's own response; on a ?account= address that
// render was of the old account and a second one had to follow, and every revalidatePath the
// action carried made the page's cached fetches a miss. This writes the cookie and nothing else
// — no render, nothing revalidated — and the client asks for the page once.
export async function POST(request: Request) {
    if (!sameOriginRequest(request.headers, request.url)) return answer({success: false, message: SWITCH_COPY.failed}, 403);

    const userId = await getCurrentUserId();
    if (!userId) return answer({success: false, message: 'Not authenticated'}, 401);

    const body: unknown = await request.json().catch(() => null);
    const accountId = typeof body === 'object' && body !== null ? (body as {accountId?: unknown}).accountId : undefined;
    if (typeof accountId !== 'string' || accountId.length > 64) return answer({success: false, message: 'Account not found'}, 400);

    try {
        // The server stays the authority on whose account this is.
        const account = await getOwnedAccount(userId, accountId);
        if (!account) return answer({success: false, message: 'Account not found'}, 404);
        await setActiveAccountCookie(String(account._id));
        return answer({success: true, message: `Switched to "${account.name || 'account'}"`}, 200);
    } catch (error) {
        console.error('Error switching account:', error);
        return answer({success: false, message: SWITCH_COPY.failed}, 500);
    }
}
