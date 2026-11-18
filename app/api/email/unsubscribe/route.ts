import {NextResponse} from "next/server";
import {unsubscribeSecret, verifyUnsubscribeToken} from "@/lib/email/unsubscribe";
import {setEmailNotifications} from "@/lib/settings/preferences-store";

export const runtime = 'nodejs';   // mongoose needs Node, not edge

// The mark a mail client's one-click unsubscribe carries in its body (RFC 8058).
const ONE_CLICK = 'List-Unsubscribe=One-Click';

// Turns the daily brief off for the reader a signed link names (lib/email/unsubscribe.ts).
//
// POST only: a mail scanner or a link previewer follows every GET in a message, and must not be
// able to unsubscribe anyone. Two callers post here. A mail client's one-click unsubscribe (the
// List-Unsubscribe and List-Unsubscribe-Post headers of the brief) wants a plain 200. The
// /unsubscribe page's button is a browser form, and is sent back to that page.
//
// No session and no same-origin check, on purpose: the reader is usually signed out, a mail
// client posts from elsewhere, and the token is the authority — it names one account and does
// one thing.
export async function POST(request: Request) {
    const url = new URL(request.url);
    const userId = url.searchParams.get('u');
    const token = url.searchParams.get('t');
    const body = await request.text().catch(() => '');
    const oneClick = body.includes(ONE_CLICK);
    const back = (state: 'done' | 'invalid' | 'failed') => NextResponse.redirect(new URL(`/unsubscribe?${state}=1`, url), 303);

    if (!verifyUnsubscribeToken(userId, token, unsubscribeSecret())) {
        return oneClick ? NextResponse.json({success: false}, {status: 400}) : back('invalid');
    }
    try {
        await setEmailNotifications(userId, false);
    } catch (error) {
        console.error('Error unsubscribing a reader from the daily brief:', error);
        return oneClick ? NextResponse.json({success: false}, {status: 500}) : back('failed');
    }
    return oneClick ? NextResponse.json({success: true}) : back('done');
}
