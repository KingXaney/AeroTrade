import Link from "next/link";
import type {RulesSeeCell, RulesSeeView} from "@/lib/learn/rules-see";
import {RULES_SEE_COPY} from "@/lib/learn/copy/rules-see";
import {STATE_LABEL, STATE_TONE} from "@/lib/strategies/views";
import {cn} from "@/lib/utils";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";
import MicroLabel from "@/components/primitives/MicroLabel";
import Badge from "@/components/primitives/Badge";
import Term from "@/components/primitives/Term";
import WhatTheseMean from "@/components/learn/WhatTheseMean";

// The stock page's "What the rules see": for each strategy that watches this symbol, the row it
// stored on its latest board — verdict and values as that strategy's own signal board prints
// them (lib/learn/rules-see.ts). Dates and values every row shares are stated once above the
// rows; strategies with no stored row are named once below them. The panel's one disclosure
// reads each row in plain words, then lists the definitions of the columns shown. Omitted by
// the page for a symbol no strategy watches. Server component; no inline prose.

const Cell = ({cell}: {cell: RulesSeeCell}) => (
    <span className="text-xs">
        <MicroLabel title={cell.column.glossary ? undefined : cell.column.help}>
            {cell.column.glossary ? <Term k={cell.column.glossary}>{cell.column.label}</Term> : cell.column.label}{' '}
        </MicroLabel>
        <span className="font-mono text-fg-soft">{cell.value}</span>
    </span>
);

const RulesSee = ({view}: {view: RulesSeeView}) => {
    const missing = view.entries.length === 0
        ? RULES_SEE_COPY.missingAll(view.symbol)
        : view.missing.length > 0 ? RULES_SEE_COPY.missing(view.symbol, view.missing) : null;
    return (
        <Panel id="rules-see" aria-labelledby="rules-see-heading">
            <SectionHeading id="rules-see-heading" spacing="sm">{RULES_SEE_COPY.heading}</SectionHeading>
            <p className="text-xs text-fg-soft leading-relaxed">{RULES_SEE_COPY.intro(view.symbol, view.watching)}</p>
            {(view.stamp || view.shared.length > 0) && (
                <div data-rules-see-shared className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1">
                    {view.stamp && (
                        <span className="font-mono text-[11px] text-fg-muted">{RULES_SEE_COPY.stamp(view.stamp.asOf, view.stamp.date)}</span>
                    )}
                    {view.shared.map((cell) => <Cell key={cell.column.key} cell={cell} />)}
                </div>
            )}
            {view.entries.length > 0 && (
                <ul className="mt-3 divide-y divide-line-strong/10">
                    {view.entries.map((entry) => (
                        <li key={entry.strategyId} data-rules-see-row={entry.strategyId}
                            className={cn('py-2.5 first:pt-0 space-y-1', entry.state === 'excluded' && 'opacity-70')}>
                            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                                <Link href={`/strategies/${entry.strategyId}`} className="font-heading text-sm font-semibold text-fg hover:text-brand">
                                    {entry.name}
                                </Link>
                                <Badge tone={STATE_TONE[entry.state]} variant="outline" data-rules-see-verdict>
                                    {STATE_LABEL[entry.state]}
                                </Badge>
                            </div>
                            {entry.stamp && (
                                <p className="font-mono text-[10px] text-fg-muted">{RULES_SEE_COPY.stamp(entry.stamp.asOf, entry.stamp.date)}</p>
                            )}
                            {entry.cells.length > 0 && (
                                <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
                                    {entry.cells.map((cell) => <Cell key={cell.column.key} cell={cell} />)}
                                </div>
                            )}
                            {entry.note && <p className="text-[10px] text-fg-muted">{entry.note}</p>}
                        </li>
                    ))}
                </ul>
            )}
            {missing && <p data-rules-see-missing className="mt-2 font-mono text-[11px] text-fg-muted">{missing}</p>}
            {view.entries.length > 0 && (
                <WhatTheseMean keys={view.glossary} label={RULES_SEE_COPY.readingLabel(view.symbol)}>
                    <div className="space-y-3 max-w-3xl">
                        {view.entries.map((entry) => (
                            <div key={entry.strategyId} data-rules-see-reading={entry.strategyId} className="space-y-1">
                                <p className="font-heading text-xs font-semibold text-fg">{entry.name}</p>
                                {entry.reading.map((line, index) => (
                                    <p key={index} className="text-xs text-fg-soft leading-relaxed">{line}</p>
                                ))}
                            </div>
                        ))}
                    </div>
                </WhatTheseMean>
            )}
        </Panel>
    );
};

export default RulesSee;
