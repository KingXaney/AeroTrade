'use client';

import {useLayoutEffect, useRef} from "react";
import {EDGE_FADE_REM, edgeFade, scrollToShow} from "@/lib/shell/track-scroll";

// What marks the current tab: a section's page (aria-current, components/shell/SectionTabs) or a
// page's view (aria-selected, components/primitives/Tabs).
const CURRENT = '[aria-current="page"], [aria-selected="true"]';

const motionReduced = (): boolean =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduced';

// Keeps the current tab of a row that scrolls sideways (a tab track on a phone, .tab-track; the
// topics' chips) in sight, and names the ends of the row with more of it to scroll to, where the
// row fades (data-edge-fade), so a row cut at the screen's edge reads as one that goes on. The
// current tab is placed on the first paint after hydration, at once, and whenever `current`
// changes, gliding there unless motion is reduced (the OS setting or the in-app toggle). Only the
// row scrolls, never the page — scrollIntoView would also move the window, and pull a page opened
// at an anchor back up to its tabs. Where the row fits, there is nothing to do and nothing fades;
// a box that does not scroll sideways (a tab track from md, the topics' rail from lg) is never
// marked, however far a child of it is drawn past its sides.
export function useCurrentInTrack<T extends HTMLElement>(current: string) {
    const ref = useRef<T>(null);
    const placed = useRef(false);
    useLayoutEffect(() => {
        const track = ref.current;
        if (!track) return;
        const tab = track.querySelector<HTMLElement>(CURRENT);
        if (tab) {
            // As much of the row stays in sight beside the tab as the fade at an end is wide, so a
            // neighbour shows that the row goes on and the tab is never under the fade: the fade's
            // rem in the root size of the moment, the reader's own.
            const inset = EDGE_FADE_REM * parseFloat(getComputedStyle(document.documentElement).fontSize);
            const box = track.getBoundingClientRect();
            const rect = tab.getBoundingClientRect();
            const start = rect.left - box.left - track.clientLeft + track.scrollLeft;
            const next = scrollToShow({start, end: start + rect.width, scrollLeft: track.scrollLeft, width: track.clientWidth, inset});
            if (next !== null) {
                if (placed.current && !motionReduced()) track.scrollTo({left: next, behavior: 'smooth'});
                else track.scrollLeft = next;
            }
        }
        placed.current = true;

        const mark = () => {
            const fade = edgeFade({scrollLeft: track.scrollLeft, width: track.clientWidth, scrollWidth: track.scrollWidth, overflowX: getComputedStyle(track).overflowX});
            if (fade) track.dataset.edgeFade = fade;
            else delete track.dataset.edgeFade;
        };
        mark();
        track.addEventListener('scroll', mark, {passive: true});
        const observer = new ResizeObserver(mark);
        observer.observe(track);
        return () => {
            track.removeEventListener('scroll', mark);
            observer.disconnect();
        };
    }, [current]);
    return ref;
}
