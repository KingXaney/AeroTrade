'use server';

import {auth} from "@/lib/better-auth/auth";
import {inngest} from "@/lib/inngest/client";
import {cookies, headers} from "next/headers";
import {THEME_COOKIE} from "@/lib/theme/resolve";
import {syncThemeCookieForUser} from "@/lib/actions/appearance.actions";
import {PASSWORD_RESET_LIMIT, PASSWORD_RESET_WINDOW_MS, passwordResetKey, takeRateLimit} from "@/lib/auth/rate-limit";
import {seedDefaultTopics} from "@/lib/topics/seed";

// Better-auth throws APIError-shaped objects with body.message; fall back to .message or a generic string.
const extractAuthError = (e: unknown, fallback: string): string => {
    if (e && typeof e === 'object') {
        const anyErr = e as { body?: {message?: string}; message?: string };
        return anyErr.body?.message || anyErr.message || fallback;
    }
    return fallback;
}

export const signUpWithEmail = async ({ email, password, fullName, country, investmentGoals, riskTolerance, preferredIndustry }: SignUpFormData) => {
    try {
        const response = await auth.api.signUpEmail({ body: { email, password, name: fullName } })

        if(response) {
            // Awaited, not queued: the user is redirected to the dashboard the moment this
            // returns, and the topics-first layout is the first thing they see. The welcome
            // event carries no user id, so this cannot move into that handler as it stands.
            // Never allowed to fail the sign-up — an account with no topics is recoverable
            // (the /topics safety net seeds it), an account that failed to exist is not.
            if (response.user?.id) {
                await seedDefaultTopics(response.user.id).catch((e) => console.error('Failed to seed default topics', e))
            }

            await inngest.send({
                name: 'app/user.created',
                data: { email, name: fullName, country, investmentGoals, riskTolerance, preferredIndustry }
            }).catch((e) => console.error('Failed to queue welcome email', e))
        }

        return { success: true, data: response }
    } catch (e) {
        console.error('Sign up failed', e)
        return { success: false, error: extractAuthError(e, 'Sign up failed') }
    }
}

export const signInWithEmail = async ({ email, password }: SignInFormData) => {
    try {
        const response = await auth.api.signInEmail({ body: { email, password } })
        if (response?.user?.id) {
            await syncThemeCookieForUser(response.user.id).catch((e) => console.error('Theme cookie sync failed', e));
        }

        return { success: true, data: response }
    } catch (e) {
        console.error('Sign in failed', e)
        return { success: false, error: extractAuthError(e, 'Invalid email or password') }
    }
}

// One answer for every path — unknown address, known address, rate-limited, mailer
// down. better-auth itself throws only when the transport fails, which can only
// happen for a *known* address; letting that surface would tell a stranger which
// emails have accounts.
const RESET_REQUESTED = 'If an account exists for that address, a reset link is on its way. It expires in 30 minutes.';

export const requestPasswordReset = async ({ email }: { email: string }): Promise<{ success: true; message: string }> => {
    const normalized = (email ?? '').trim().toLowerCase();
    try {
        if (normalized && await takeRateLimit(passwordResetKey(normalized), PASSWORD_RESET_LIMIT, PASSWORD_RESET_WINDOW_MS)) {
            await auth.api.requestPasswordReset({ body: { email: normalized } });
        } else if (normalized) {
            console.warn('Password reset rate limit reached for an address');
        }
    } catch (e) {
        console.error('Password reset request failed', e);
    }
    return { success: true, message: RESET_REQUESTED };
}

export const resetPassword = async ({ token, newPassword }: { token: string; newPassword: string }) => {
    try {
        await auth.api.resetPassword({ body: { token, newPassword } });
        return { success: true }
    } catch (e) {
        console.error('Password reset failed', e)
        const raw = extractAuthError(e, '');
        return { success: false, error: /token/i.test(raw) || !raw ? 'This reset link is invalid or has expired. Request a new one.' : raw }
    }
}

export const signOut = async () => {
    try {
        await auth.api.signOut({ headers: await headers() });
        (await cookies()).delete(THEME_COOKIE);
    } catch (e) {
        console.error('Sign out failed', e)
        return { success: false, error: 'Sign out failed' }
    }
}