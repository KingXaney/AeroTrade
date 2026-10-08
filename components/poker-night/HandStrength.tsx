// What the viewer's cards make so far, under their cards: "Pair of nines" before the flop, "Flush,
// ace high" by the river (lib/poker-night/dock.handStrength, worded by HAND_COPY.label). With two or
// three boards (PLO, after the flop) one line of each board's kind — "1 Flush · 2 Pair · 3
// Straight" (HAND_COPY.onBoardsShort) — the names in full as its accessible name, so the dock keeps
// its height. A pill of palette chrome, so it never sits on the bare scene. A long name wraps to a
// second line rather than being cut short on a narrow phone ("Two pair, sixes and twos").

import {HAND_COPY} from "@/lib/learn/copy/poker-night";
import type {HandDescription} from "@/lib/poker-night/hand-name";

const PILL = 'chrome-surface inline-block max-w-full rounded-2xl px-3 py-1 text-xs font-semibold leading-tight text-fg line-clamp-2 whitespace-normal';

const HandStrength = ({strength, strengths = null}: {strength: HandDescription | null; strengths?: readonly HandDescription[] | null}) => {
    if (strengths && strengths.length > 1) {
        return (
            <span className={PILL} role="img" aria-label={HAND_COPY.onBoardsSpoken(strengths.map(HAND_COPY.label))} data-pn-strength="" data-pn-boards={strengths.length}>
                {HAND_COPY.onBoardsShort(strengths.map(HAND_COPY.kind))}
            </span>
        );
    }
    return strength ? <span className={PILL} data-pn-strength="">{HAND_COPY.label(strength)}</span> : null;
};

export default HandStrength;
