import Link from "next/link";
import {cn} from "@/lib/utils";
import type {SignalColumn, SignalRow} from "@/lib/strategies/types";
import {formatSignalValue, type StrategyRunView} from "@/lib/strategies/views";

// "What it is watching": the indicator values the rule looked at on its last run,
// one row per symbol, columns declared by the catalog. Verdicts come from the rule.

const STATE_LABEL: Record<SignalRow['state'], string> = {
    held: 'held',
    enter: 'enter',
    exit: 'exit',
    watch: 'watch',
    excluded: 'excluded',
};

const STATE_CLASS: Record<SignalRow['state'], string> = {
    held: 'bg-brand/10 text-brand border-brand/20',
    enter: 'bg-positive/10 text-positive border-positive/20',
    exit: 'bg-negative/10 text-negative border-negative/20',
    watch: 'bg-surface-2/40 text-fg-muted border-line-strong/30',
    excluded: 'bg-surface-2/40 text-fg-muted border-line-strong/30 opacity-70',
};

const ORDER: Record<SignalRow['state'], number> = {enter: 0, exit: 1, held: 2, watch: 3, excluded: 4};

const SignalBoard = ({columns, run}: {columns: readonly SignalColumn[]; run: StrategyRunView | null}) => {
    if (!run || run.board.length === 0) {
        return (
            <p className="text-sm text-fg-muted p-4">
                No signals yet — the board fills on the first run, every trading morning after that.
            </p>
        );
    }
    const rows = [...run.board].sort((a, b) => ORDER[a.state] - ORDER[b.state] || a.symbol.localeCompare(b.symbol));
    const template = `minmax(7rem,1.4fr) repeat(${columns.length}, minmax(5rem,1fr)) minmax(5rem,0.8fr)`;

    return (
        <div className="space-y-1.5" id="signal-board">
            <p className="text-[11px] text-fg-muted mb-2" style={{fontFamily: 'var(--type-mono)'}}>
                As of the {run.asOf} close · decided for {run.date}
                {run.staleCount > 0 ? ` · ${run.staleCount} of ${run.universeSize} symbols had no fresh bar` : ''}
            </p>
            <div className="overflow-x-auto">
                <div className="min-w-[36rem]">
                    <div className="grid gap-3 px-3 py-2 border-b border-line-strong/30"
                         style={{gridTemplateColumns: template, fontFamily: 'var(--type-mono)', fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-muted)'}}>
                        <div>Symbol</div>
                        {columns.map((c) => <div key={c.key} className="text-right" title={c.help}>{c.label}</div>)}
                        <div className="text-right">Verdict</div>
                    </div>
                    {rows.map((row) => (
                        <div key={row.symbol}
                             className={cn('grid gap-3 items-center px-3 py-2 border-b border-line-strong/10 text-xs', row.state === 'excluded' && 'opacity-60')}
                             style={{gridTemplateColumns: template}}>
                            <div className="min-w-0">
                                <Link href={`/stocks/${row.symbol}`} className="font-bold text-fg hover:text-brand" style={{fontFamily: 'var(--type-mono)'}}>{row.symbol}</Link>
                                {row.note && <span className="block text-[10px] text-fg-muted truncate" title={row.note}>{row.note}</span>}
                            </div>
                            {columns.map((c) => (
                                <div key={c.key} className="text-right text-fg-soft" style={{fontFamily: 'var(--type-mono)'}}>
                                    {formatSignalValue(row.values[c.key], c.format)}
                                </div>
                            ))}
                            <div className="text-right">
                                <span className={cn('inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider border', STATE_CLASS[row.state])} style={{fontFamily: 'var(--type-mono)'}}>
                                    {STATE_LABEL[row.state]}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default SignalBoard;
