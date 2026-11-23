// On a phone a tab track (.tab-track in app/globals.css) is one row that scrolls sideways, and the
// current tab is kept in sight. This is the arithmetic, in the track's own coordinates — a tab's
// edges measured from the start of the track's scrolled content — so the hook that measures and
// scrolls (hooks/useCurrentInTrack) holds no sums of its own.

export type TrackSpan = {
    /** The current tab's left and right edges, from the left edge of the track's content. */
    start: number;
    end: number;
    /** How far the track is scrolled, and how wide the part of it in sight is. */
    scrollLeft: number;
    width: number;
    /** Room to keep in sight beside the tab, so a neighbour shows that the row goes on. */
    inset?: number;
};

// Where the track scrolls so the tab is in sight with `inset` beside it, or null when it already
// is. A tab that fits with less room than that on both sides is centred; one wider than the track
// is lined up at its start. Never a scroll before the row starts.
export const scrollToShow = ({start, end, scrollLeft, width, inset = 0}: TrackSpan): number | null => {
    const size = end - start;
    const room = Math.max(0, Math.min(inset, (width - size) / 2));
    let target: number | null = null;
    if (size > width || start - room < scrollLeft) target = Math.max(0, start - room);
    else if (end + room > scrollLeft + width) target = end + room - width;
    return target === null || target === scrollLeft ? null : target;
};

export type EdgeFade = 'start' | 'end' | 'both' | null;

// The ends of a row that scrolls sideways with more of it to scroll to: where it fades
// (data-edge-fade in app/globals.css), so a row cut at the screen's edge reads as one that goes on.
// A row that fits fades nowhere, and a pixel of rounding is not more.
export const edgeFade = ({scrollLeft, width, scrollWidth}: {scrollLeft: number; width: number; scrollWidth: number}): EdgeFade => {
    const before = scrollLeft > 1;
    const after = scrollLeft + width < scrollWidth - 1;
    if (before && after) return 'both';
    if (before) return 'start';
    if (after) return 'end';
    return null;
};
