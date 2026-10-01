// The one way the app reads who is signed in. Server-only: it reads the request's headers and
// reaches lib/auth/server.ts, whose top-level await needs a database — tests mock this module.
// Not 'use server': these take nothing from a caller, but they are not client endpoints either.

import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {auth} from "@/lib/auth/server";

// The signed-in user as the (root) layout hands it to the shell, or null when signed out.
// A failed session read throws, as better-auth's does: a page fails rather than signing out.
export const getSessionUser = async (): Promise<User | null> => {
    const session = await auth.api.getSession({headers: await headers()});
    if (!session?.user) return null;
    return {id: session.user.id, name: session.user.name, email: session.user.email};
};

// For actions and routes: a failed session read is logged and reads as signed out.
export const getCurrentUserId = async (): Promise<string | null> => {
    try {
        const session = await auth.api.getSession({headers: await headers()});
        return session?.user?.id ?? null;
    } catch (error) {
        console.error('Error reading session:', error);
        return null;
    }
};

// For pages: the signed-in user's id, or a redirect to /sign-in.
export const requireUserId = async (): Promise<string> => {
    const userId = await getCurrentUserId();
    if (!userId) redirect('/sign-in');
    return userId;
};
