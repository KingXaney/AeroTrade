import type {StrategyDefinition} from "@/lib/strategies/types";
import {describeNextRebalance} from "@/lib/strategies/calendar";
import {UNIVERSES} from "@/lib/strategies/universe";

// The teaching panel: the rule in plain words, why anyone believes in it, when it
// breaks, and every simplification the numbers on this page carry. All of it is
// static catalog copy — nothing here is generated.

const List = ({title, items}: {title: string; items: readonly string[]}) => (
    <div>
        <h3 className="text-xs font-semibold text-fg mb-1.5" style={{fontFamily: 'var(--type-display)'}}>{title}</h3>
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

const StrategyExplainer = ({def, lastRebalanceDate}: {def: StrategyDefinition; lastRebalanceDate: string | null}) => {
    const {explainer} = def;
    return (
        <section className="glass-panel rounded-xl p-5 space-y-5" id="strategy-explainer">
            <div>
                <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-brand mb-2" style={{fontFamily: 'var(--type-mono)'}}>
                    How it works
                </h2>
                <p className="text-sm text-fg-soft leading-relaxed">{explainer.summary}</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-5">
                <List title="The rule" items={explainer.how} />
                <div>
                    <h3 className="text-xs font-semibold text-fg mb-1.5" style={{fontFamily: 'var(--type-display)'}}>Parameters</h3>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs" style={{fontFamily: 'var(--type-mono)'}}>
                        {Object.entries(def.params).map(([key, value]) => (
                            <div key={key} className="contents">
                                <dt className="text-fg-muted">{PARAM_LABELS[key] ?? key}</dt>
                                <dd className="text-fg text-right">{formatParam(value)}</dd>
                            </div>
                        ))}
                        <dt className="text-fg-muted">Universe</dt>
                        <dd className="text-fg text-right">{UNIVERSES[def.universe].length} symbol{UNIVERSES[def.universe].length === 1 ? '' : 's'}</dd>
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
                <h3 className="text-xs font-semibold text-fg mb-1" style={{fontFamily: 'var(--type-display)'}}>What it is watching</h3>
                <p className="text-xs text-fg-muted leading-relaxed">{explainer.watching}</p>
            </div>

            <p className="text-sm text-fg italic border-l-2 border-brand/40 pl-3">{explainer.beginnerLine}</p>

            <List title="Read the numbers with this in mind" items={explainer.caveats} />
        </section>
    );
};

export default StrategyExplainer;
