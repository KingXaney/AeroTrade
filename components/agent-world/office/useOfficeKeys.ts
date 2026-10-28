'use client';

import {useEffect, useRef, type RefObject} from "react";
import {officeIntentForKey, type OfficeIntent} from "@/lib/agent-world/office-keys";

// The office's single-key shortcuts (lib/agent-world/office-keys): only while the focus is inside
// the office (or on the page itself, nothing else focused), never in a field, a menu or a dialog,
// never with a modifier or on a repeat. A focused button keeps its own Enter and Space.
export const useOfficeKeys = (rootRef: RefObject<HTMLElement | null>, onIntent: (intent: OfficeIntent) => void) => {
    const handler = useRef(onIntent);
    useEffect(() => {
        handler.current = onIntent;
    }, [onIntent]);
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            const target = event.target instanceof HTMLElement ? event.target : null;
            const root = rootRef.current;
            if (!root) return;
            const onPage = target === null || target === document.body;
            if (!onPage && !root.contains(target)) return;
            if (target?.closest('input, textarea, select, [contenteditable="true"], [role="menu"], [role="listbox"]')) return;
            if (target?.closest('[role="dialog"]') && event.key !== 'Escape') return;
            if ((event.key === 'Enter' || event.key === ' ') && target?.closest('button, a')) return;
            const intent = officeIntentForKey(event);
            if (!intent) return;
            event.preventDefault();
            handler.current(intent);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [rootRef]);
};
