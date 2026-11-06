import Term from "@/components/primitives/Term";
import type {IcTable as Table} from "@/lib/research/ic";
import {RESEARCH_COPY} from "@/lib/learn/copy/research";

// A brain's signal check as one table (research log R1): a row per signal in the order the brain
// hands them, a column per horizon, each cell the mean weekly information coefficient with its
// t-statistic beneath. Neutral: no cell carries a sign colour, and nothing here re-sorts a row.
const formatIc = (ic: number): string => `${ic < 0 ? '−' : '+'}${Math.abs(ic).toFixed(3)}`;

export const icFigures = (table: Table): number => table.rows.reduce((count, row) => count + row.cells.filter((cell) => cell !== null).length, 0);
export const icMostWeeks = (table: Table): number => Math.max(0, ...table.rows.flatMap((row) => row.cells.map((cell) => cell?.weeks ?? 0)));

const IcTable = ({table}: {table: Table}) => (
    <div className="overflow-x-auto">
        <table className="w-full text-xs" data-signal-check>
            <caption className="sr-only">{RESEARCH_COPY.horizonCaption}</caption>
            <thead>
                <tr className="label-type text-[length:var(--label-size)] text-fg-muted border-b border-line-strong/30">
                    <th scope="col" className="text-left font-normal py-2 pr-4">{RESEARCH_COPY.signalHeader}</th>
                    {table.horizons.map((weeks) => (
                        <th key={weeks} scope="col" className="text-right font-normal py-2 px-2 whitespace-nowrap">
                            <Term k="information-coefficient">{RESEARCH_COPY.horizon(weeks)}</Term>
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {table.rows.map((row) => (
                    <tr key={row.id} data-signal={row.id} className="border-b border-line-strong/15 last:border-0">
                        <th scope="row" className={row.strong ? 'text-left py-2 pr-4 font-semibold text-fg' : 'text-left py-2 pr-4 font-normal text-fg-soft'}>
                            {row.label}
                        </th>
                        {row.cells.map((cell, index) => (
                            <td key={table.horizons[index]} data-horizon={table.horizons[index]} className="text-right py-2 px-2 font-mono tabular-nums text-fg">
                                {cell === null ? <span className="text-fg-muted">—</span> : (
                                    <>
                                        <span data-ic>{formatIc(cell.meanIc)}</span>
                                        <span className="block text-[10px] text-fg-muted" data-t>
                                            <Term k="ic-t-statistic">{RESEARCH_COPY.tLine(cell.tStat)}</Term>
                                        </span>
                                    </>
                                )}
                            </td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

export default IcTable;
