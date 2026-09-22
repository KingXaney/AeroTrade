// The reading guide for the leaderboard: what "live" and "simulated" mean here and
// every simplification the numbers carry. Plain statements, no hedging language.

const POINTS: readonly {title: string; body: string}[] = [
    {title: 'Live', body: 'A real paper account per strategy, opened on the launch date with $100,000 and traded by the rule every trading morning. Ranked by return since launch, measured against SPY over the same days.'},
    {title: 'Simulated', body: 'The same rule run over three years of stored daily closes ending the day before launch. A backtest: hypothetical, shown apart from live results and never blended into them.'},
    {title: 'Fills', body: 'A decision is made on the previous close and filled at the next session — live about five minutes after the open at the last price, simulated at the next day\'s open. No look-ahead.'},
    {title: 'Sizing', body: 'Whole shares only, sized from the previous close with a 1% buffer, keeping at least 1% cash. Small cash residues are normal.'},
    {title: 'Costs', body: 'No commissions, no slippage and no dividends in either record, so long-only results understate what an index fund earns by roughly its yield.'},
    {title: 'Universe', body: 'A fixed list chosen in 2026: SPY and other core ETFs, the eleven sector ETFs and forty large caps. Applied to earlier years it carries survivorship bias, which the simulated numbers inherit.'},
];

const HowToRead = () => (
    <section className="glass-panel rounded-xl p-5" id="strategies-how-to-read">
        <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-brand mb-3" style={{fontFamily: 'var(--type-mono)'}}>
            How to read this
        </h2>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
            {POINTS.map((p) => (
                <div key={p.title}>
                    <dt className="text-xs font-semibold text-fg" style={{fontFamily: 'var(--type-display)'}}>{p.title}</dt>
                    <dd className="text-xs text-fg-muted leading-relaxed">{p.body}</dd>
                </div>
            ))}
        </dl>
        <p className="mt-4 text-[10px] uppercase tracking-[0.08em] text-fg-muted" style={{fontFamily: 'var(--type-mono)'}}>
            Deterministic rules · no AI · paper money · not financial advice
        </p>
    </section>
);

export default HowToRead;
