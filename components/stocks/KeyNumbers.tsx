import type {KeyNumber} from "@/lib/stocks/key-numbers";
import {KEY_NUMBERS_COPY} from "@/lib/learn/copy/key-numbers";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";
import EmptyState from "@/components/primitives/EmptyState";
import Term from "@/components/primitives/Term";
import WhatTheseMean from "@/components/learn/WhatTheseMean";

// The stock page's "Key numbers": each figure the market-data feed reports (lib/stocks/key-numbers.ts),
// its value and one sentence saying what it divides. The definitions live in the panel's one
// "What these mean". Without a market-data key the feed sends nothing, and the panel says so
// rather than printing zeros. Server component; no inline prose.

const KeyNumbers = ({symbol, rows}: {symbol: string; rows: readonly KeyNumber[]}) => (
    <Panel id="key-numbers" aria-labelledby="key-numbers-heading">
        <SectionHeading id="key-numbers-heading" spacing="sm">{KEY_NUMBERS_COPY.heading}</SectionHeading>
        {rows.length === 0 ? (
            <EmptyState
                title={KEY_NUMBERS_COPY.emptyTitle(symbol)}
                description={KEY_NUMBERS_COPY.emptyDescription}
                className="px-0"
            />
        ) : (
            <>
                <dl className="divide-y divide-line-strong/10">
                    {rows.map((row) => (
                        <div key={row.key} data-key-number={row.key} className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 py-2.5 first:pt-0">
                            <dt className="text-xs text-fg-muted"><Term k={row.key} /></dt>
                            <dd className="font-mono text-base font-semibold text-fg text-right">{row.value}</dd>
                            <dd className="col-span-2 mt-1 text-xs text-fg-soft leading-relaxed">{row.sentence}</dd>
                        </div>
                    ))}
                </dl>
                <p className="mt-2 font-mono text-[11px] text-fg-muted">{KEY_NUMBERS_COPY.source}</p>
                <WhatTheseMean keys={rows.map((row) => row.key)} />
            </>
        )}
    </Panel>
);

export default KeyNumbers;
