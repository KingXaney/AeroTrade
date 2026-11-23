'use client';

import {useLayoutEffect, useRef} from "react";
import {scrollToShow} from "@/lib/shell/track-scroll";

// What marks the current tab: a section's page (aria-current, components/shell/SectionTabs) or a
// page's view (aria-selected, components/primitives/Tabs).
const CURRENT = '[aria-current="page"], [aria-selected="true"]';
// How much of the row stays in sight beside the current tab, so a neighbour shows that it goes on.
const INSET = 24;

// Keeps the current tab of a tab track (.tab-track, one row that scrolls sideways on a phone) in
// sight: on the first paint after hydration and whenever `current` changes. Only the track
// scrolls, never the page — scrollIntoView would also move the window, and pull a page opened at
// an anchor back up to its tabs. Where the row fits, there is nothing to do.
export function useCurrentInTrack<T extends HTMLElement>(current: string) {
    const ref = useRef<T>(null);
    useLayoutEffect(() => {
        const track = ref.current;
        const tab = track?.querySelector<HTMLElement>(CURRENT);
        if (!track || !tab) return;
        const box = track.getBoundingClientRect();
        const rect = tab.getBoundingClientRect();
        const start = rect.left - box.left - track.clientLeft + track.scrollLeft;
        const next = scrollToShow({start, end: start + rect.width, scrollLeft: track.scrollLeft, width: track.clientWidth, inset: INSET});
        if (next !== null) track.scrollLeft = next;
    }, [current]);
    return ref;
}
