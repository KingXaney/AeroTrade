// The one way the app reads who is signed in. Server-only: it reads the request's headers and
// reaches lib/auth/server.ts, whose top-level await needs a database — tests mock this module.
// Not 'use server': these take nothing from a caller, but they are not client endpoints either.

import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {auth} from "@/lib/auth/server";
import {isLabOwner} from "@/lib/lab/owner";
import type {User} from '@/lib/auth/types';

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

// For actions that gate on who the person is (the owner's lab): the user with their email, or
// null — a failed read logged and read as signed out, as getCurrentUserId does.
export const getCurrentUser = async (): Promise<User | null> => {
    try {
        return await getSessionUser();
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

// For pages that show the owner more than anyone else (lib/lab/owner.ts): the signed-in user with
// their email, or a redirect to /sign-in.
export const requireUser = async (): Promise<User> => {
    const user = await getCurrentUser();
    if (!user) redirect('/sign-in');
    return user;
};

// For the owner's own pages — both brains, the trading agent world, the strategies: the owner, a
// redirect to /sign-in when signed out, or Home for anyone else, where nothing links to them.
export const requireOwner = async (): Promise<User> => {
    const user = await requireUser();
    if (!isLabOwner(user.email)) redirect('/');
    return user;
};

// For the owner's actions and routes: the owner's id, or null — signed out and anyone else alike,
// since no page offers those actions to anyone but the owner.
export const getOwnerUserId = async (): Promise<string | null> => {
    const user = await getCurrentUser();
    return user && isLabOwner(user.email) ? user.id : null;
};
