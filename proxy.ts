import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Cheap pre-render gate: no session cookie, no app. The (root) layout re-checks the
// session server-side, so this only saves a render — it is not the security boundary.
//
// The front door is the one exception. A visitor with no cookie who asks for "/" is shown the
// landing page there (a rewrite, so the address stays "/" and a signed-in reader gets Home at
// the same one); any other page of the app sends them to sign in.
export function proxy(request: NextRequest) {
    if (getSessionCookie(request)) return NextResponse.next();
    if (request.nextUrl.pathname === '/') return NextResponse.rewrite(new URL("/welcome", request.url));
    return NextResponse.redirect(new URL("/sign-in", request.url));
}

export const config = {
    matcher: [
        // forgot-password and reset-password are public by design: the emailed reset link
        // is opened logged out, and bouncing it to /sign-in would drop the token. icon.svg is
        // app/icon.svg's tab icon, which the logged-out pages need too. welcome is the landing
        // page under its own address. play/ is a poker night table (/play/CODE), opened by guests
        // with no account; it keeps its slash so /play, /players and /playground stay gated.
        '/((?!api|_next/static|_next/image|icon.svg|sign-in|sign-up|forgot-password|reset-password|welcome|assets|play/).*)',
    ],
};
