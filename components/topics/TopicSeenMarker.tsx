'use client';

import {useEffect, useRef} from "react";
import {markTopicSeen} from "@/lib/actions/topics.actions";

// Opening a topic marks it seen. No refresh here: the "New" markers stay for this
// visit and the rail/sidebar counts settle on the next navigation.
const TopicSeenMarker = ({topicId, unseenCount}: {topicId: string; unseenCount: number}) => {
    const done = useRef(false);
    useEffect(() => {
        if (done.current || unseenCount === 0) return;
        done.current = true;
        void markTopicSeen(topicId);
    }, [topicId, unseenCount]);
    return null;
};

export default TopicSeenMarker;
