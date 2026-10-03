'use client';

import {useEffect, useState} from "react";
import {subscribeNewsSeen} from "@/lib/shell/news-seen";

// The epoch ms at which the reader opened News in this session, or null. The rail and the drawer
// zero their News dot once it is set, and the card says "just now"; the server's own stamp takes
// over on the next full load. State is set inside the event callback, never in the effect body.
export const useNewsSeen = (): number | null => {
    const [clearedAt, setClearedAt] = useState<number | null>(null);
    useEffect(() => subscribeNewsSeen(() => setClearedAt(Date.now())), []);
    return clearedAt;
};
