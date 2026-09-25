import Link from "next/link";
import {cn} from "@/lib/utils";
import type {SignalColumn, SignalRow} from "@/lib/strategies/types";
import {formatSignalValue, visibleSignalColumns, type StrategyRunView} from "@/lib/strategies/views";
import Badge from "@/components/primitives/Badge";
import EmptyState from "@/components/primitives/EmptyState";
import MicroLabel from "@/components/primitives/MicroLabel";

// "What it is watching": the indicator values the rule looked at on its last run,
// one row per symbol, columns declared by the catalog. Verdicts come from the rule.
//
// Two rules keep this honest rather than decorative. A column every row leaves blank is
// hidden — Dual Momentum watches four symbols and was printing three columns of
// em-dashes. And only the top rows are shown: RSI-2 ranks forty names, which was ~1,500px
// of scroll and the single biggest reason its page ran to five screens.

const SHOWN = 12;

const STATE_LABEL: Record<SignalRow['state'], string> = {
    held: 'held', enter: 'enter', exit: 'exit', watch: 'watch', excluded: 'excluded',
};

const STATE_TONE: Record<SignalRow['state'], 'brand' | 'positive' | 'negative' | 'neutral'> = {
    held: 'brand', enter: 'positive', exit: 'negative', watch: 'neutral', excluded: 'neutral',
};

const ORDER: Record<SignalRow['state'], number> = {enter: 0, exit: 1, held: 2, watch: 3, excluded: 4};

const Verdict = ({state}: {state: SignalRow['state']}) => (
    <Badge tone={STATE_TONE[state]} variant="outline" className={cn(state === 'excluded' && 'opacity-70')}>
        {STATE_LABEL[state]}
    </Badge>
);

const Table = ({columns, rows}: {columns: SignalColumn[]; rows: SignalRow[]}) => {
    const template = `minmax(7rem,1.4fr) repeat(${columns.length}, minmax(5rem,1fr)) minmax(5rem,0.8fr)`;
    return (
        <div className="overflow-x-auto">
            <div className="min-w-[30rem]">
                <div className="grid gap-3 px-3 py-2 border-b border-line-strong/30" style={{gridTemplateColumns: template}}>
                    <MicroLabel>Symbol</MicroLabel>
                    {columns.map((c) => <MicroLabel key={c.key} className="text-right" title={c.help}>{c.label}</MicroLabel>)}
                    <MicroLabel className="text-right">Verdict</MicroLabel>
                </div>
                {rows.map((row) => (
                    <div key={row.symbol} data-signal-row={row.symbol}
                         className={cn('grid gap-3 items-center px-3 py-2 border-b border-line-strong/10 text-xs', row.state === 'excluded' && 'opacity-60')}
                         style={{gridTemplateColumns: template}}>
                        <div className="min-w-0">
                            <Link href={`/stocks/${row.symbol}`} className="font-mono font-bold text-fg hover:text-brand">{row.symbol}</Link>
                            {row.note && <span className="block text-[10px] text-fg-muted truncate" title={row.note}>{row.note}</span>}
                        </div>
                        {columns.map((c) => (
                            <div key={c.key} className="font-mono text-right text-fg-soft">
                                {formatSignalValue(row.values[c.key], c.format)}
                            </div>
                        ))}
                        <div className="text-right"><Verdict state={row.state} /></div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// One or two symbols is not a table. A header row over a single line of values is
// theatre — the labels outnumber the data.
const Pairs = ({columns, rows}: {columns: SignalColumn[]; rows: SignalRow[]}) => (
    <div className="space-y-3">
        {rows.map((row) => (
            <div key={row.symbol} data-signal-row={row.symbol} className="flex flex-wrap items-center gap-x-5 gap-y-1">
                <Link href={`/stocks/${row.symbol}`} className="font-mono text-sm font-bold text-fg hover:text-brand">{row.symbol}</Link>
                {columns.map((c) => (
                    <span key={c.key} className="text-xs">
                        <MicroLabel>{c.label} </MicroLabel>
                        <span className="font-mono text-fg-soft">{formatSignalValue(row.values[c.key], c.format)}</span>
                    </span>
                ))}
                <Verdict state={row.state} />
                {row.note && <span className="text-[10px] text-fg-muted">{row.note}</span>}
            </div>
        ))}
    </div>
);

const SignalBoard = ({columns, run}: {columns: readonly SignalColumn[]; run: StrategyRunView | null}) => {
    if (!run || run.board.length === 0) {
        return (
            <EmptyState
                title="No signals yet."
                description="The board fills on the first run, every trading morning after that."
                className="p-0"
            />
        );
    }

    const rows = [...run.board].sort((a, b) => ORDER[a.state] - ORDER[b.state] || a.symbol.localeCompare(b.symbol));
    const shownColumns = visibleSignalColumns(columns, run.board);
    const head = rows.slice(0, SHOWN);
    const rest = rows.slice(SHOWN);
    const Body = rows.length <= 2 ? Pairs : Table;

    return (
        <div className="space-y-1.5" id="signal-board">
            <p className="font-mono text-[11px] text-fg-muted mb-2">
                As of the {run.asOf} close · decided for {run.date}
                {run.staleCount > 0 ? ` · ${run.staleCount} of ${run.universeSize} symbols had no fresh bar` : ''}
            </p>
            <Body columns={shownColumns} rows={head} />
            {rest.length > 0 && (
                <details className="pt-2">
                    <summary className="font-mono cursor-pointer text-[11px] text-brand hover:underline">
                        Show all {rows.length} symbols
                    </summary>
                    <div className="pt-2"><Table columns={shownColumns} rows={rest} /></div>
                </details>
            )}
        </div>
    );
};

export default SignalBoard;
