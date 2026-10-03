'use client';

import {useCallback, useEffect, useRef, useState} from "react";
import {parseChatUsage, type ChatUsage} from "@/lib/chat/usage";

// The panel's read of what is left of the chat's rate-limit windows: GET /api/chat/usage on
// mount and whenever the panel asks again (after each reply or refusal). Null while pending and
// after any failure — a signed-out 401, a network error, an unexpected shape — so the caption is
// simply absent and the chat keeps working. Nothing is stored. Responses can land out of order;
// a request sequence keeps only the newest answer.
export const useChatUsage = (): {usage: ChatUsage | null; refreshUsage: () => void} => {
    const [usage, setUsage] = useState<ChatUsage | null>(null);
    const latest = useRef(0);

    const refreshUsage = useCallback(() => {
        const request = ++latest.current;
        fetch('/api/chat/usage', {cache: 'no-store'})
            .then((res) => (res.ok ? res.json() : null))
            .then((body: unknown) => {
                if (request === latest.current) setUsage(parseChatUsage(body));
            })
            .catch(() => {
                if (request === latest.current) setUsage(null);
            });
    }, []);

    // The state moves in the promise callbacks above, never in the effect body itself.
    useEffect(() => {
        refreshUsage();
    }, [refreshUsage]);

    return {usage, refreshUsage};
};
