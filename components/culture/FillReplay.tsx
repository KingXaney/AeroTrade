import Disclosure from "@/components/primitives/Disclosure";
import ReasonGloss from "@/components/learn/ReasonGloss";
import type {FillReplay as FillReplayView} from "@/lib/culture/page-store";
import {CULTURE_PICKS_COPY} from "@/lib/learn/copy/culture";

// The one "What the picker saw" a culture fill carries, on its trade-log row (invariant 12):
// the reasons of the decision item that placed it, as written and read in plain words.
const FillReplay = ({replay}: {replay: FillReplayView}) => (
    <Disclosure data-culture-fill summary={CULTURE_PICKS_COPY.fillSummary}>
        <ul className="mt-2 space-y-0.5">
            {replay.reasons.map((reason) => (
                <li key={reason} className="text-[11px] text-fg-muted font-mono">· {reason}</li>
            ))}
        </ul>
        <ReasonGloss clauses={replay.gloss} className="mt-2" />
    </Disclosure>
);

export default FillReplay;
