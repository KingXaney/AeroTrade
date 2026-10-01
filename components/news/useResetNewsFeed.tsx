'use client';

import {useState} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import ConfirmDialog from "@/components/primitives/ConfirmDialog";
import {resetNewsFeed} from "@/lib/actions/news-feed.actions";
import {defaultNewsFeed, type NewsFeedPrefs} from "@/lib/news/feed-prefs";

// "Reset to top stories", confirmed first: /news' editor and /settings' summary both offer it.
// `askReset` opens the confirmation; `resetDialog` is that dialog, rendered by the caller.
// A reset that lands hands the stored feed to `onReset`, toasts and refreshes the page; one
// that fails toasts why and changes nothing.
const useResetNewsFeed = (onReset: (feed: NewsFeedPrefs) => void) => {
    const router = useRouter();
    const [confirming, setConfirming] = useState(false);

    const reset = async () => {
        const result = await resetNewsFeed();
        if (!result.success) {
            toast.error(result.message ?? 'Could not reset your news feed');
            return;
        }
        onReset(result.feed ?? defaultNewsFeed());
        toast.success('News feed reset to top stories');
        router.refresh();
    };

    const resetDialog = (
        <ConfirmDialog
            open={confirming}
            onOpenChange={setConfirming}
            title="Reset your news feed?"
            description="Back to Google News top stories for the United States. Your categories, regions, outlets and keywords are cleared."
            confirmLabel="Reset feed"
            destructive
            onConfirm={reset}
        />
    );

    return {askReset: () => setConfirming(true), resetDialog};
};

export default useResetNewsFeed;
