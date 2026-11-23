'use client';

import {useLayoutEffect, useRef} from "react";
import {edgeFade, scrollToShow} from "@/lib/shell/track-scroll";

// What marks the current tab: a section's page (aria-current, components/shell/SectionTabs) or a
// page's view (aria-selected, components/primitives/Tabs).
const CURRENT = '[aria-current="page"], [aria-selected="true"]';
// How much of the row stays in sight beside the current tab, so a neighbour shows that it goes on:
// as wide as the fade at an end with more to scroll to (data-edge-fade in app/globals.css), so the
// current tab is never under it.
const INSET = 24;

const motionReduced = (): boolean =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduced';

// Keeps the current tab of a row that scrolls sideways (a tab track on a phone, .tab-track; the
// topics' chips) in sight, and names the ends of the row with more of it to scroll to, where the
// row fades (data-edge-fade), so a row cut at the screen's edge reads as one that goes on. The
// current tab is placed on the first paint after hydration, at once, and whenever `current`
// changes, gliding there unless motion is reduced (the OS setting or the in-app toggle). Only the
// row scrolls, never the page — scrollIntoView would also move the window, and pull a page opened
// at an anchor back up to its tabs. Where the row fits, there is nothing to do and nothing fades.
export function useCurrentInTrack<T extends HTMLElement>(current: string) {
    const ref = useRef<T>(null);
    const placed = useRef(false);
    useLayoutEffect(() => {
        const track = ref.current;
        if (!track) return;
        const tab = track.querySelector<HTMLElement>(CURRENT);
        if (tab) {
            const box = track.getBoundingClientRect();
            const rect = tab.getBoundingClientRect();
            const start = rect.left - box.left - track.clientLeft + track.scrollLeft;
            const next = scrollToShow({start, end: start + rect.width, scrollLeft: track.scrollLeft, width: track.clientWidth, inset: INSET});
            if (next !== null) {
                if (placed.current && !motionReduced()) track.scrollTo({left: next, behavior: 'smooth'});
                else track.scrollLeft = next;
            }
        }
        placed.current = true;

        const mark = () => {
            const fade = edgeFade({scrollLeft: track.scrollLeft, width: track.clientWidth, scrollWidth: track.scrollWidth});
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
