// What the viewer's cards make so far, under their cards: "Pair of nines" before the flop, "Flush,
// ace high" by the river (lib/poker-night/dock.handStrength, worded by HAND_COPY.label). A pill of
// palette chrome, so it never sits on the bare scene.

import {HAND_COPY} from "@/lib/learn/copy/poker-night";
import type {HandDescription} from "@/lib/poker-night/hand-name";

const HandStrength = ({strength}: {strength: HandDescription | null}) =>
    strength ? (
        <span className="chrome-surface inline-flex max-w-full items-center truncate rounded-full px-3 py-1 text-xs font-semibold text-fg" data-pn-strength="">
            {HAND_COPY.label(strength)}
        </span>
    ) : null;

export default HandStrength;
