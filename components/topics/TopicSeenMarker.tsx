'use client';

import {useEffect, useRef} from "react";
import {markTopicSeen} from "@/lib/actions/topics.actions";

// Opening a topic marks it seen, every time: the stamp is also the first-week step "Open one of
// your topics" (lib/learn/facts-store.ts), so a topic with nothing new still counts as opened.
// No refresh here: the "New" markers stay for this visit and the counts settle on the next
// navigation. "Last opened News" is a stamp of its own (components/news/NewsSeenMarker).
const TopicSeenMarker = ({topicId}: {topicId: string}) => {
    const done = useRef(false);
    useEffect(() => {
        if (done.current) return;
        done.current = true;
        void markTopicSeen(topicId);
    }, [topicId]);
    return null;
};

export default TopicSeenMarker;
