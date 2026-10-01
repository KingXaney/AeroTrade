import type {ActionResult} from '@/lib/actions/types';

// A server action called from a client button, with its outcome toasted. Pure and
// client-safe: the caller hands in sonner's `toast`, so vitest can pass a recorder.
//
// The actions catch their own errors and answer {success: false}; what still throws
// is the call itself — a dropped connection, a timeout, a deploy that renamed the
// action. Without the catch that rejection goes nowhere and the button just stops
// looking busy, as if the click had never happened.

export const UNREACHABLE_MESSAGE = 'Could not reach the server — check your connection and try again';

type Toaster = {success: (message: string) => unknown; error: (message: string) => unknown};

// True when the action succeeded, so the caller can refresh.
export const runWithToast = async (
    action: () => Promise<ActionResult>,
    toaster: Toaster,
    fallbacks: {success: string; error: string},
): Promise<boolean> => {
    try {
        const result = await action();
        if (result.success) {
            toaster.success(result.message || fallbacks.success);
            return true;
        }
        toaster.error(result.message || fallbacks.error);
        return false;
    } catch {
        toaster.error(UNREACHABLE_MESSAGE);
        return false;
    }
};
