'use client';

import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {signOut} from "@/lib/actions/auth.actions";

// The one sign-out every logout button calls. It was written four times: three pushed to
// /sign-in whatever happened, the mobile drawer's never navigated at all, and none read a
// failed result — a failed sign-out left the user in the app, still signed in, with no word.
export const useSignOut = () => {
    const router = useRouter();
    return async (): Promise<boolean> => {
        const result = await signOut().catch(() => ({success: false as const, error: 'Sign out failed'}));
        if (!result.success) {
            toast.error('Could not sign out', {description: 'Check your connection and try again.'});
            return false;
        }
        router.replace('/sign-in');
        router.refresh();
        return true;
    };
};
