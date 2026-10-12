// What the viewer's cards make so far, under their cards: "Pair of nines" before the flop, "Flush,
// ace high" by the river (lib/poker-night/dock.handStrength, worded by HAND_COPY.label). With two or
// three boards (PLO, after the flop) each board's kind behind its numeral's badge (.pn-board-num),
// the badge never parted from its kind's first word and the line breaking between boards first (a
// kind wraps on its own only where it alone is wider than the line: "Three of a kind" beside the
// cards of a 320 px phone); the names in full as its accessible name. A pill of palette chrome, so it never sits on the bare scene. A long name wraps to
// a second line rather than being cut short on a narrow phone ("Two pair, sixes and twos").

import {HAND_COPY} from "@/lib/learn/copy/poker-night";
import type {HandDescription} from "@/lib/poker-night/hand-name";

const PILL = 'chrome-surface inline-block max-w-full rounded-2xl px-3 py-1 text-xs font-semibold leading-tight text-fg line-clamp-2 whitespace-normal';
const BOARDS_PILL = 'chrome-surface inline-flex max-w-full flex-wrap items-center gap-x-2.5 gap-y-1 rounded-2xl px-3 py-1 text-xs font-semibold leading-tight text-fg';

const HandStrength = ({strength, strengths = null}: {strength: HandDescription | null; strengths?: readonly HandDescription[] | null}) => {
    if (strengths && strengths.length > 1) {
        return (
            <span className={BOARDS_PILL} role="img" aria-label={HAND_COPY.onBoardsSpoken(strengths.map(HAND_COPY.label))} data-pn-strength="" data-pn-boards={strengths.length}>
                {strengths.map((d, k) => (
                    <span key={k} className="inline-flex max-w-full items-start gap-1" data-pn-strength-board={k}>
                        <span className="pn-board-num font-mono" aria-hidden="true">{k + 1}</span>
                        <span data-pn-kind="">{HAND_COPY.kind(d)}</span>
                    </span>
                ))}
            </span>
        );
    }
    return strength ? <span className={PILL} data-pn-strength="">{HAND_COPY.label(strength)}</span> : null;
};

export default HandStrength;
