import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Cheap pre-render gate: no session cookie, no app. The (root) layout re-checks the
// session server-side, so this only saves a render — it is not the security boundary.
export function proxy(request: NextRequest) {
    if (!getSessionCookie(request)) {
        return NextResponse.redirect(new URL("/sign-in", request.url));
    }
    return NextResponse.next();
}

export const config = {
    matcher: [
        // forgot-password and reset-password are public by design: the emailed reset link
        // is opened logged out, and bouncing it to /sign-in would drop the token.
        '/((?!api|_next/static|_next/image|favicon.ico|sign-in|sign-up|forgot-password|reset-password|assets).*)',
    ],
};
