import {STRATEGIES_DISCLAIMER} from "@/lib/strategies/catalog";
import Panel from "@/components/primitives/Panel";
import Disclosure from "@/components/primitives/Disclosure";
import MicroLabel from "@/components/primitives/MicroLabel";
import {HOW_TO_READ_COPY} from "@/lib/learn/copy/strategies";

// The reading guide for the leaderboard: what "live" and "simulated" mean here and
// every simplification the numbers carry. Plain statements, no hedging language.
//
// Collapsed by default. It is reference material — true on every visit, needed once —
// and a permanently open wall of prose under the ranking was most of what made the page
// read as generated. Native <details>, so it costs no JavaScript and still prints.


const HowToRead = () => (
    <Panel as="div" id="strategies-how-to-read">
        <Disclosure variant="panel" summary={HOW_TO_READ_COPY.summary}>
            <dl className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
                {HOW_TO_READ_COPY.points.map((p) => (
                    <div key={p.title}>
                        <dt className="font-heading text-xs font-semibold text-fg">{p.title}</dt>
                        <dd className="text-xs text-fg-muted leading-relaxed">{p.body}</dd>
                    </div>
                ))}
            </dl>
        </Disclosure>
        {/* Outside the disclosure on purpose: a disclaimer nobody can see without
            expanding a panel is not a disclaimer. Rendered once per page. */}
        <MicroLabel as="p" className="mt-4">
            {STRATEGIES_DISCLAIMER}
        </MicroLabel>
    </Panel>
);

export default HowToRead;
