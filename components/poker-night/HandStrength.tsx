// What the viewer's cards make so far, under their cards: "Pair of nines" before the flop, "Flush,
// ace high" by the river (lib/poker-night/dock.handStrength, worded by HAND_COPY.label). A pill of
// palette chrome, so it never sits on the bare scene. A long name wraps to a second line rather than
// being cut short on a narrow phone ("Two pair, sixes and twos").

import {HAND_COPY} from "@/lib/learn/copy/poker-night";
import type {HandDescription} from "@/lib/poker-night/hand-name";

const HandStrength = ({strength}: {strength: HandDescription | null}) =>
    strength ? (
        <span className="chrome-surface inline-block max-w-full rounded-2xl px-3 py-1 text-xs font-semibold leading-tight text-fg line-clamp-2 whitespace-normal"
              data-pn-strength="">
            {HAND_COPY.label(strength)}
        </span>
    ) : null;

export default HandStrength;
