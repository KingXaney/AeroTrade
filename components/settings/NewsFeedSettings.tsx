'use client';

import {useState} from "react";
import Link from "next/link";
import useResetNewsFeed from "@/components/news/useResetNewsFeed";
import {describeNewsFeed, isDefaultNewsFeed, type NewsFeedPrefs} from "@/lib/news/feed-prefs";

const mono = {fontFamily: 'var(--type-mono)'} as const;

// Read-mostly summary; editing lives on /news, next to the feed it changes.
const NewsFeedSettings = ({initial}: {initial: NewsFeedPrefs}) => {
    const [feed, setFeed] = useState(initial);
    const {askReset, resetDialog} = useResetNewsFeed(setFeed);

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
            <button id="settings-news-reset" type="button" onClick={askReset} disabled={isDefaultNewsFeed(feed)}
                    className="text-xs uppercase tracking-[0.1em] text-fg-muted hover:text-negative transition-colors disabled:opacity-40 disabled:hover:text-fg-muted" style={mono}>
                Reset to top stories
            </button>
            {resetDialog}
        </div>
    );
};

export default NewsFeedSettings;
