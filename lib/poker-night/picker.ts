// The keys of a radio group (the avatar builder's faces, colours, frames and badges; the look
// pickers' scenes, felts, card backs and chip sets): the arrows move to the next or the previous
// choice and wrap at the ends, Home and End go to the first and the last — the WAI-ARIA radio group
// pattern, whatever the wrapped grid's width. Pure and client-safe.

// The choice a key moves to from `index` among `count`, or null for a key the group leaves alone.
export const stepChoice = (index: number, key: string, count: number): number | null => {
    if (!Number.isInteger(count) || count <= 0) return null;
    const at = Number.isInteger(index) ? Math.min(Math.max(0, index), count - 1) : 0;
    switch (key) {
        case 'ArrowRight':
        case 'ArrowDown':
            return (at + 1) % count;
        case 'ArrowLeft':
        case 'ArrowUp':
            return (at - 1 + count) % count;
        case 'Home':
            return 0;
        case 'End':
            return count - 1;
        default:
            return null;
    }
};
