import {STRATEGIES_DISCLAIMER} from "@/lib/strategies/catalog";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";

// The reading guide for the leaderboard: what "live" and "simulated" mean here and
// every simplification the numbers carry. Plain statements, no hedging language.
//
// Collapsed by default. It is reference material — true on every visit, needed once —
// and a permanently open wall of prose under the ranking was most of what made the page
// read as generated. Native <details>, so it costs no JavaScript and still prints.

const POINTS: readonly {title: string; body: string}[] = [
    {title: 'Live', body: 'A real paper account per strategy, opened on the launch date with $100,000 and traded by the rule every trading morning. Ranked by return since launch, measured against SPY over the same days.'},
    {title: 'Simulated', body: 'The same rule run over three years of stored daily closes ending the day before launch. A backtest: hypothetical, shown apart from live results and never blended into them.'},
    {title: 'Fills', body: 'A decision is made on the previous close and filled at the next session — live about five minutes after the open at the last price, simulated at the next day\'s open. No look-ahead.'},
    {title: 'Sizing', body: 'Whole shares only, sized from the previous close with a 1% buffer, keeping at least 1% cash. Small cash residues are normal.'},
    {title: 'Costs', body: 'No commissions, no slippage and no dividends in either record, so long-only results understate what an index fund earns by roughly its yield.'},
    {title: 'Universe', body: 'A fixed list chosen in 2026: SPY and other core ETFs, the eleven sector ETFs and forty large caps. Applied to earlier years it carries survivorship bias, which the simulated numbers inherit.'},
];

const HowToRead = () => (
    <Panel as="div" id="strategies-how-to-read">
        <details className="group">
            <summary className="cursor-pointer list-none marker:content-none [&::-webkit-details-marker]:hidden">
                <SectionHeading as="h2" spacing="none" className="inline-flex items-center gap-2">
                    <span className="material-symbols-outlined text-base transition-transform group-open:rotate-90" aria-hidden="true">chevron_right</span>
                    How to read this — live vs simulated, fills, sizing, costs, universe
                </SectionHeading>
            </summary>
            <dl className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
                {POINTS.map((p) => (
                    <div key={p.title}>
                        <dt className="font-heading text-xs font-semibold text-fg">{p.title}</dt>
                        <dd className="text-xs text-fg-muted leading-relaxed">{p.body}</dd>
                    </div>
                ))}
            </dl>
        </details>
        {/* Outside the disclosure on purpose: a disclaimer nobody can see without
            expanding a panel is not a disclaimer. Rendered once per page. */}
        <p className="font-mono mt-4 text-[10px] uppercase tracking-[0.1em] text-fg-muted">
            {STRATEGIES_DISCLAIMER}
        </p>
    </Panel>
);

export default HowToRead;
