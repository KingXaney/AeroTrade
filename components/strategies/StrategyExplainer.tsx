import type {StrategyDefinition} from "@/lib/strategies/types";
import {describeNextRebalance} from "@/lib/strategies/calendar";
import {UNIVERSES} from "@/lib/strategies/universe";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";

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

const PARAM_LABELS: Record<string, string> = {
    allocation: 'Target allocation',
    spyWeight: 'SPY weight',
    aggWeight: 'AGG weight',
    fast: 'Fast average (days)',
    slow: 'Slow average (days)',
    lookback: 'Lookback (trading days)',
    skip: 'Skip most recent (days)',
    top: 'Positions held',
    rsiPeriod: 'RSI period',
    entryRsi: 'Entry: RSI below',
    exitSma: 'Exit: close above SMA (days)',
    trendSma: 'Trend filter SMA (days)',
    entryChannel: 'Entry channel (days)',
    exitChannel: 'Exit channel (days)',
    volWindow: 'Volatility window (days)',
};

const formatParam = (value: number | string): string =>
    typeof value === 'number' && value > 0 && value < 1 ? `${(value * 100).toFixed(0)}%` : String(value);

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
            <details className="group" open={defaultOpen}>
                <summary className="cursor-pointer list-none marker:content-none [&::-webkit-details-marker]:hidden">
                    <SectionHeading as="h2" spacing="none" className="inline-flex items-center gap-2">
                        <span className="material-symbols-outlined text-base transition-transform group-open:rotate-90" aria-hidden="true">chevron_right</span>
                        How it works — the rule, its parameters and when it fails
                    </SectionHeading>
                </summary>

                <div className="mt-4 space-y-5">
                    <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-5">
                        <List title="The rule" items={explainer.how} />
                        <div>
                            <h3 className="font-heading text-xs font-semibold text-fg mb-1.5">Parameters</h3>
                            <dl className="font-mono grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                                {Object.entries(def.params).map(([key, value]) => (
                                    <div key={key} className="contents">
                                        <dt className="text-fg-muted">{PARAM_LABELS[key] ?? key}</dt>
                                        <dd className="text-fg text-right">{formatParam(value)}</dd>
                                    </div>
                                ))}
                                <dt className="text-fg-muted">Universe</dt>
                                <dd className="text-fg text-right">{universeSize} symbol{universeSize === 1 ? '' : 's'}</dd>
                                <dt className="text-fg-muted">Checks</dt>
                                <dd className="text-fg text-right">{def.cadence === 'once' ? 'once' : def.cadence}</dd>
                                <dt className="text-fg-muted">Next rebalance</dt>
                                <dd className="text-fg text-right">{describeNextRebalance(def.cadence, lastRebalanceDate)}</dd>
                                <dt className="text-fg-muted">Cash floor</dt>
                                <dd className="text-fg text-right">1%</dd>
                            </dl>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <List title="Why it might work" items={explainer.why} />
                        <List title="When it fails" items={explainer.fails} />
                    </div>

                    <div>
                        <h3 className="font-heading text-xs font-semibold text-fg mb-1">What it is watching</h3>
                        <p className="text-xs text-fg-muted leading-relaxed">{explainer.watching}</p>
                    </div>

                    <List title="Read the numbers with this in mind" items={explainer.caveats} />
                </div>
            </details>
        </Panel>
    );
};

export default StrategyExplainer;
