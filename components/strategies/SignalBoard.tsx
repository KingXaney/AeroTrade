import Link from "next/link";
import {cn} from "@/lib/utils";
import type {SignalColumn, SignalRow} from "@/lib/strategies/types";
import {formatSignalValue, sortBoard, STATE_LABEL, STATE_TONE, visibleSignalColumns, type StrategyRunView} from "@/lib/strategies/views";
import Badge from "@/components/primitives/Badge";
import EmptyState from "@/components/primitives/EmptyState";
import MicroLabel from "@/components/primitives/MicroLabel";
import {SIGNAL_BOARD_COPY} from "@/lib/learn/copy/strategies";

// "What it is watching": the indicator values the rule looked at on its last run,
// one row per symbol, columns declared by the catalog. Verdicts come from the rule.
//
// Two rules keep this honest rather than decorative. A column every row leaves blank is
// hidden — Dual Momentum watches four symbols and was printing three columns of
// em-dashes. And only the top rows are shown: RSI-2 ranks forty names, which was ~1,500px
// of scroll and the single biggest reason its page ran to five screens.
//
// The verdict vocabulary (labels, tones, order) lives in lib/strategies/views so the
// replay cannot drift from this table; `data-verdict` marks each verdict cell for the
// browser QA.

const SHOWN = 12;

const Verdict = ({state}: {state: SignalRow['state']}) => (
    <Badge tone={STATE_TONE[state]} variant="outline" className={cn(state === 'excluded' && 'opacity-70')} data-verdict>
        {STATE_LABEL[state]}
    </Badge>
);

const Table = ({columns, rows}: {columns: readonly SignalColumn[]; rows: SignalRow[]}) => {
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

// One board row as a line of label/value pairs — the view for a one- or two-symbol
// board, and the shape the decision replay reuses so a past row reads like today's.
export const SignalRowLine = ({columns, row}: {columns: readonly SignalColumn[]; row: SignalRow}) => (
    <div data-signal-row={row.symbol} className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <Link href={`/stocks/${row.symbol}`} className="font-mono text-sm font-bold text-fg hover:text-brand">{row.symbol}</Link>
        {columns.map((c) => (
            <span key={c.key} className="text-xs">
                <MicroLabel title={c.help}>{c.label} </MicroLabel>
                <span className="font-mono text-fg-soft">{formatSignalValue(row.values[c.key], c.format)}</span>
            </span>
        ))}
        <Verdict state={row.state} />
        {row.note && <span className="text-[10px] text-fg-muted">{row.note}</span>}
    </div>
);

// One or two symbols is not a table. A header row over a single line of values is
// theatre — the labels outnumber the data.
const Pairs = ({columns, rows}: {columns: readonly SignalColumn[]; rows: SignalRow[]}) => (
    <div className="space-y-3">
        {rows.map((row) => <SignalRowLine key={row.symbol} columns={columns} row={row} />)}
    </div>
);

const SignalBoard = ({columns, run}: {columns: readonly SignalColumn[]; run: StrategyRunView | null}) => {
    if (!run || run.board.length === 0) {
        return (
            <EmptyState
                title={SIGNAL_BOARD_COPY.emptyTitle}
                description={SIGNAL_BOARD_COPY.emptyDescription}
                className="p-0"
            />
        );
    }

    const rows = sortBoard(run.board);
    const shownColumns = visibleSignalColumns(columns, run.board);
    const head = rows.slice(0, SHOWN);
    const rest = rows.slice(SHOWN);
    const Body = rows.length <= 2 ? Pairs : Table;

    return (
        <div className="space-y-1.5" id="signal-board">
            <p className="font-mono text-[11px] text-fg-muted mb-2">
                {SIGNAL_BOARD_COPY.stamp(run.asOf, run.date, run.staleCount, run.universeSize)}
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
