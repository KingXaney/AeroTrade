import PerformanceChart, {type DollarLineTone} from "@/components/analytics/PerformanceChart";
import MicroLabel from "@/components/primitives/MicroLabel";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";
import Term from "@/components/primitives/Term";
import WhatTheseMean from "@/components/learn/WhatTheseMean";
import SeriesTiles from "@/components/strategies/SeriesTiles";
import {TIM_COPY, TIM_TERMS, wayTiles} from "@/lib/learn/copy/time-in-market";
import type {GlossaryKey} from "@/lib/learn/glossary";
import {WAY_KEYS, type WayKey} from "@/lib/learn/time-in-market";
import type {TimeInMarketRead} from "@/lib/learn/time-in-market-read";

// "Time in the market", on the buy-and-hold SPY page only: the same money owned three ways
// over a window the learner picks with a native GET form (?from=, validated and clamped on the
// server), side by side and never ranked — no colour marks a way as ahead. The chart is the
// growth of each dollar contributed (PerformanceChart's dollar mode; the monthly way takes
// deposits, so it is not a return series). The panel has one disclosure, "Why the start date
// matters" — the reading, a table of earlier starts and the definitions — and one caveat.
// Server component; every sentence comes from lib/learn/copy/time-in-market.ts.

const WAY_TERM: Record<WayKey, GlossaryKey> = {lumpSum: 'lump-sum', dollarCostAverage: 'dollar-cost-averaging', cashOnly: 'cash-only'};
const WAY_TONE: Record<WayKey, DollarLineTone> = {lumpSum: 'brand', dollarCostAverage: 'secondary', cashOnly: 'muted'};

const TimeInMarket = ({view, path}: {view: TimeInMarketRead; path: string}) => {
    const {resolved} = view;
    const source = TIM_COPY.source(resolved.source, resolved.from, view.inception);
    const href = (from: string) => `${path}?from=${from}#time-in-market`;
    const lines = view.chart.lines.map((line) => ({key: line.key, label: TIM_COPY.wayLabel[line.key], tone: WAY_TONE[line.key], values: line.values}));

    return (
        <section id="time-in-market" aria-labelledby="time-in-market-heading" className="space-y-3 scroll-mt-24">
            <Panel id="time-in-market-panel">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <SectionHeading id="time-in-market-heading" spacing="none">{TIM_COPY.heading}</SectionHeading>
                    <form method="get" action={`${path}#time-in-market`} id="time-in-market-form" className="flex items-end gap-2">
                        <label className="flex flex-col gap-1">
                            <MicroLabel>{TIM_COPY.startLabel}</MicroLabel>
                            <input
                                type="date" name="from" id="time-in-market-from" required
                                defaultValue={resolved.from} min={resolved.floor} max={resolved.ceiling}
                                aria-describedby="time-in-market-range"
                                className="rounded-lg px-3 py-1.5 text-sm text-fg font-mono bg-surface-0 border border-line-strong/40 outline-none field-focus"
                            />
                        </label>
                        <button type="submit" className="px-3 py-2 rounded-md font-mono text-[11px] font-bold uppercase tracking-[0.08em] bg-brand/10 text-brand hover:bg-brand/20 transition-colors">
                            {TIM_COPY.submit}
                        </button>
                    </form>
                </div>
                <p className="font-mono text-[11px] text-fg mt-3" id="time-in-market-window">
                    {view.status === 'ok' ? TIM_COPY.window(view.amount, view.start, view.end, view.sessions) : TIM_COPY.noHistory}
                </p>
                <p className="font-mono text-[10px] text-fg-muted mt-1" id="time-in-market-range">{TIM_COPY.range(resolved.floor, resolved.ceiling)}</p>
                {resolved.outOfRange !== null && (
                    <p className="font-mono text-[11px] text-fg-muted mt-1" data-testid="time-in-market-moved">{TIM_COPY.outOfRange(resolved.outOfRange, resolved.from)}</p>
                )}
                {source !== null && <p className="font-mono text-[11px] text-fg-muted mt-1" data-testid="time-in-market-source">{source}</p>}
                {view.rateGap !== null && (
                    <p className="font-mono text-[11px] text-fg-muted mt-1" data-testid="time-in-market-rate-gap">{TIM_COPY.rateGap(view.rateGap)}</p>
                )}

                {view.status === 'ok' && lines.length > 0 && (
                    <figure className="mt-4">
                        <figcaption className="font-mono text-[11px] text-fg-muted mb-2" id="time-in-market-caption">{TIM_COPY.chartCaption}</figcaption>
                        <PerformanceChart dollars={{dates: view.chart.dates, lines, baseline: 1, ariaLabel: TIM_COPY.chartAria(view.start, view.end)}} />
                    </figure>
                )}

                <WhatTheseMean id="time-in-market-why" label={TIM_COPY.whyLabel} keys={TIM_TERMS}>
                    {TIM_COPY.why.map((paragraph) => (
                        <p key={paragraph} className="text-xs text-fg-soft leading-relaxed mb-2 max-w-3xl">{paragraph}</p>
                    ))}
                    {view.table.length > 0 && (
                        <table className="mt-2 w-full max-w-2xl font-mono text-xs" data-testid="time-in-market-table">
                            <caption className="caption-top text-left text-[11px] text-fg-muted pb-1">{TIM_COPY.tableCaption(view.end, view.table.length)}</caption>
                            <thead>
                                <tr className="text-fg-muted">
                                    <th scope="col" className="text-left font-normal py-1">{TIM_COPY.tableStart}</th>
                                    {WAY_KEYS.map((way) => <th key={way} scope="col" className="text-right font-normal py-1">{TIM_COPY.wayLabel[way]}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {view.table.map((row) => (
                                    <tr key={row.start} data-start={row.start} className="border-t border-line-strong/20">
                                        <th scope="row" className="text-left font-normal py-1">
                                            <a href={href(row.start)} className="text-brand hover:underline">{TIM_COPY.tableDate(row.start)}</a>
                                        </th>
                                        {WAY_KEYS.map((way) => <td key={way} className="text-right text-fg py-1" data-way={way}>{TIM_COPY.tablePct(row.ways[way])}</td>)}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </WhatTheseMean>
                <p className="font-mono text-[11px] text-fg-muted mt-3" data-testid="time-in-market-caveat">{TIM_COPY.caveat}</p>
            </Panel>

            {view.status === 'ok' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3" id="time-in-market-ways">
                    {WAY_KEYS.map((way) => {
                        const tiles = wayTiles(view.ways[way]);
                        return (
                            <SeriesTiles
                                key={way}
                                id={`time-in-market-${way}`}
                                title={<Term k={WAY_TERM[way]}>{TIM_COPY.wayLabel[way]}</Term>}
                                detail={TIM_COPY.wayDetail(way, view.start, view.deposits)}
                                tiles={[
                                    {label: TIM_COPY.endLabel, ...tiles.end},
                                    {label: TIM_COPY.changeLabel, ...tiles.change},
                                    {label: <Term k="underwater">{TIM_COPY.underwaterLabel}</Term>, ...tiles.underwater},
                                ]}
                            />
                        );
                    })}
                </div>
            )}
        </section>
    );
};

export default TimeInMarket;
