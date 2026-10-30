import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";
import Term from "@/components/primitives/Term";
import WhatTheseMean from "@/components/learn/WhatTheseMean";
import type {SignalTable} from "@/lib/culture/backtest";
import {CULTURE_PROFILES} from "@/lib/culture/config";
import {SIGNAL_CHECK_COPY, SIGNAL_CHECK_TERMS, TERM_LABELS} from "@/lib/learn/copy/culture";

// What each signal said, against what followed (research log R1): the backtest's weeks, each
// signal's ranking of the owners set beside the returns that came after it, at every horizon the
// build could measure. Neutral like the strip above it: no cell carries a sign colour and the
// rows keep the registry's order (lib/culture/backtest.toSignalTable), never their figures'.
const formatIc = (ic: number): string => `${ic < 0 ? '−' : '+'}${Math.abs(ic).toFixed(3)}`;

const SignalCheck = ({table}: {table: SignalTable}) => {
    const mostWeeks = Math.max(...table.rows.flatMap((row) => row.cells.map((cell) => cell?.weeks ?? 0)));
    const figures = table.rows.reduce((count, row) => count + row.cells.filter((cell) => cell !== null).length, 0);
    return (
        <Panel id="signal-check">
            <SectionHeading>{SIGNAL_CHECK_COPY.heading}</SectionHeading>
            <p className="text-xs text-fg-muted mb-4">{SIGNAL_CHECK_COPY.lead}</p>
            <div className="overflow-x-auto">
                <table className="w-full text-xs" data-signal-check>
                    <thead>
                        <tr className="label-type text-[length:var(--label-size)] text-fg-muted border-b border-line-strong/30">
                            <th scope="col" className="text-left font-normal py-2 pr-4">{SIGNAL_CHECK_COPY.signalHeader}</th>
                            {table.horizons.map((weeks) => (
                                <th key={weeks} scope="col" className="text-right font-normal py-2 px-2 whitespace-nowrap">
                                    <Term k="information-coefficient">{SIGNAL_CHECK_COPY.horizon(weeks)}</Term>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {table.rows.map((row) => {
                            const id = row.kind === 'score' ? `score:${row.profile}` : row.term;
                            const label = row.kind === 'score'
                                ? SIGNAL_CHECK_COPY.pickerRow(CULTURE_PROFILES[row.profile].label)
                                : TERM_LABELS[row.term];
                            return (
                                <tr key={id} data-signal={id} className="border-b border-line-strong/15 last:border-0">
                                    <th scope="row" className={row.kind === 'score' ? 'text-left py-2 pr-4 font-semibold text-fg' : 'text-left py-2 pr-4 font-normal text-fg-soft'}>
                                        {label}
                                    </th>
                                    {row.cells.map((cell, index) => (
                                        <td key={table.horizons[index]} data-horizon={table.horizons[index]} className="text-right py-2 px-2 font-mono tabular-nums text-fg">
                                            {cell === null ? <span className="text-fg-muted">—</span> : (
                                                <>
                                                    <span data-ic>{formatIc(cell.meanIc)}</span>
                                                    <span className="block text-[10px] text-fg-muted" data-t>
                                                        <Term k="ic-t-statistic">{SIGNAL_CHECK_COPY.tLine(cell.tStat)}</Term>
                                                    </span>
                                                </>
                                            )}
                                        </td>
                                    ))}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <p className="font-mono text-[11px] text-fg-muted mt-3">{SIGNAL_CHECK_COPY.weeksNote(mostWeeks)}</p>
            <p className="font-mono text-[11px] text-fg-muted mt-1">{SIGNAL_CHECK_COPY.hurdle(figures)}</p>
            <p className="font-mono text-[11px] text-fg-muted mt-1">{SIGNAL_CHECK_COPY.simulatedOnly}</p>
            <WhatTheseMean keys={SIGNAL_CHECK_TERMS} />
        </Panel>
    );
};

export default SignalCheck;
