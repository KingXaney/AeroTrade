'use client';

import {useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import {resetNewsFeed} from "@/lib/actions/news-feed.actions";
import {defaultNewsFeed, describeNewsFeed, isDefaultNewsFeed, type NewsFeedPrefs} from "@/lib/news/feed-prefs";

const mono = {fontFamily: 'var(--type-mono)'} as const;

// Read-mostly summary; editing lives on /news, next to the feed it changes.
const NewsFeedSettings = ({initial}: {initial: NewsFeedPrefs}) => {
    const router = useRouter();
    const [feed, setFeed] = useState(initial);
    const [confirming, setConfirming] = useState(false);

    const reset = async () => {
        const result = await resetNewsFeed();
        if (!result.success) {
            toast.error(result.message ?? 'Could not reset your news feed');
            return;
        }
        setFeed(result.feed ?? defaultNewsFeed());
        toast.success('News feed reset to top stories');
        router.refresh();
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p id="settings-news-summary" className="text-sm text-fg-soft" style={mono}>{describeNewsFeed(feed)}</p>
                <Link href="/news?edit=1" className="text-xs uppercase tracking-[0.1em] text-brand hover:underline" style={mono}>
                    Edit feed →
                </Link>
            </div>
            <p className="text-[11px] text-fg-muted">
                Your feed fills the News page, the News feed dashboard widget, the History page and the daily digest.
                By default it is Google News&apos; front page for the United States.
            </p>
            <button id="settings-news-reset" type="button" onClick={() => setConfirming(true)} disabled={isDefaultNewsFeed(feed)}
                    className="text-xs uppercase tracking-[0.1em] text-fg-muted hover:text-negative transition-colors disabled:opacity-40 disabled:hover:text-fg-muted" style={mono}>
                Reset to top stories
            </button>
            <ConfirmDialog
                open={confirming}
                onOpenChange={setConfirming}
                title="Reset your news feed?"
                description="Back to Google News top stories for the United States. Your categories, regions, outlets and keywords are cleared."
                confirmLabel="Reset feed"
                destructive
                onConfirm={reset}
            />
        </div>
    );
};

export default NewsFeedSettings;
