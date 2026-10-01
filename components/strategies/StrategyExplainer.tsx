import type {StrategyDefinition} from "@/lib/strategies/types";
import {describeNextRebalance} from "@/lib/strategies/calendar";
import {UNIVERSES} from "@/lib/strategies/universe";
import Panel from "@/components/primitives/Panel";
import Disclosure from "@/components/primitives/Disclosure";
import {formatParamValue, paramLabel} from "@/lib/learn/copy/whatif";
import {CADENCE_COPY} from "@/lib/learn/copy/cadence";
import {EXPLAINER_COPY} from "@/lib/learn/copy/strategies";

// The teaching panel: the rule in plain words, why anyone believes in it, when it
// breaks, and every simplification the numbers on this page carry. All of it is
// static catalog copy — nothing here is generated.
//
// Collapsed by default, because it never changes and it ran to roughly 800px — three
// quarters of a screen of documentation above the first live number. The one-sentence
// summary is lifted into the page header so the teaching is still the first thing read;
// the rest opens on click. A native <details>: no JavaScript, and it still prints.
//
// It opens itself when the strategy has not started, because then there are no numbers
// to be above and the explanation IS the page.

const List = ({title, items}: {title: string; items: readonly string[]}) => (
    <div>
        <h3 className="font-heading text-xs font-semibold text-fg mb-1.5">{title}</h3>
        <ul className="space-y-1.5">
            {items.map((item) => (
                <li key={item} className="text-xs text-fg-muted leading-relaxed pl-3 border-l border-line-strong/30">{item}</li>
            ))}
        </ul>
    </div>
);

type Props = {
    def: StrategyDefinition;
    lastRebalanceDate: string | null;
    // Open on load when there is nothing else on the page yet.
    defaultOpen?: boolean;
};

const StrategyExplainer = ({def, lastRebalanceDate, defaultOpen = false}: Props) => {
    const {explainer} = def;
    const universeSize = UNIVERSES[def.universe].length;

    return (
        <Panel as="div" id="strategy-explainer">
            <Disclosure variant="panel" open={defaultOpen} summary={EXPLAINER_COPY.summary}>
                <div className="mt-4 space-y-5">
                    <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-5">
                        <List title={EXPLAINER_COPY.rule} items={explainer.how} />
                        <div>
                            <h3 className="font-heading text-xs font-semibold text-fg mb-1.5">{EXPLAINER_COPY.parameters}</h3>
                            <dl className="font-mono grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                                {Object.entries(def.params).map(([key, value]) => (
                                    <div key={key} className="contents">
                                        <dt className="text-fg-muted">{paramLabel(key)}</dt>
                                        <dd className="text-fg text-right">{formatParamValue(value)}</dd>
                                    </div>
                                ))}
                                <dt className="text-fg-muted">{EXPLAINER_COPY.universe}</dt>
                                <dd className="text-fg text-right">{EXPLAINER_COPY.universeSize(universeSize)}</dd>
                                <dt className="text-fg-muted">{EXPLAINER_COPY.checks}</dt>
                                <dd className="text-fg text-right">{CADENCE_COPY.short[def.cadence]}</dd>
                                <dt className="text-fg-muted">{EXPLAINER_COPY.nextRebalance}</dt>
                                <dd className="text-fg text-right">{describeNextRebalance(def.cadence, lastRebalanceDate)}</dd>
                                <dt className="text-fg-muted">{EXPLAINER_COPY.cashFloor}</dt>
                                <dd className="text-fg text-right">{EXPLAINER_COPY.cashFloorValue}</dd>
                            </dl>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <List title={EXPLAINER_COPY.why} items={explainer.why} />
                        <List title={EXPLAINER_COPY.fails} items={explainer.fails} />
                    </div>

                    <div>
                        <h3 className="font-heading text-xs font-semibold text-fg mb-1">{EXPLAINER_COPY.watching}</h3>
                        <p className="text-xs text-fg-muted leading-relaxed">{explainer.watching}</p>
                    </div>

                    <List title={EXPLAINER_COPY.caveats} items={explainer.caveats} />
                </div>
            </Disclosure>
        </Panel>
    );
};

export default StrategyExplainer;
