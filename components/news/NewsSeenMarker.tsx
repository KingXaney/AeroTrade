'use client';

import {useEffect, useRef} from "react";
import {markNewsSeen} from "@/lib/actions/news-feed.actions";
import {announceNewsSeen} from "@/lib/shell/news-seen";

// Opening News (/news, the /topics index) stamps `newsSeenAt`, the stamp behind the rail's dot and
// its card's "Since you last looked". Once per mount, like TopicSeenMarker; then the shell is told
// (lib/shell/news-seen.ts) so the dot clears without a round trip — the (root) layout does not
// re-render on a soft navigation, and server truth returns on the next full load.
const NewsSeenMarker = () => {
    const done = useRef(false);
    useEffect(() => {
        if (done.current) return;
        done.current = true;
        void markNewsSeen().then((result) => {
            if (result.success) announceNewsSeen();
        });
    }, []);
    return null;
};

export default NewsSeenMarker;
