import Link from "next/link";
import {cn} from "@/lib/utils";
import {formatPrice, getChangeColorClass} from "@/lib/format";
import Badge from "@/components/primitives/Badge";
import Disclosure from "@/components/primitives/Disclosure";
import RowCard, {rowCard} from "@/components/primitives/RowCard";
import SafeMarkdown from "@/components/primitives/SafeMarkdown";
import Term from "@/components/primitives/Term";
import WhatTheseMean from "@/components/learn/WhatTheseMean";
import ReasonGloss from "@/components/learn/ReasonGloss";
import BrandChips from "@/components/culture/BrandChips";
import type {DecisionAction} from "@/lib/culture/decisions";
import type {GlossedDecisionItem} from "@/lib/culture/page-store";
import type {ProfileId} from "@/lib/culture/config";
import {CULTURE_PICKS_COPY, PICKS_TERMS} from "@/lib/learn/copy/culture";
import type {CultureEligibility} from "@/lib/culture/scoring";

// A picker's latest decision: every order it planned with what happened to it, every position
// it kept, the brands that put each symbol in its universe, its reasons as written and — one
// disclosure per item — the same reasons read in plain words (decoded on the server by
// lib/learn/culture-reasons). A record of what the picker did: no Apply, nothing to act on.
// The same panel draws an enrolled account's decision (scope 'follow'): the picker's targets
// sized to that account, with no universe line, no feeds and no rationale of its own — a note
// from the caller in their place.

// The picker's own decision carries its universe, feeds and rationale; an enrolled account's
// carries only the items.
export type PanelDecision = {
    profile: ProfileId;
    date: string;
    kind: 'executed' | 'preview' | 'skipped';
    items: GlossedDecisionItem[];
    universe?: {tickers: number; quoted: number};
    // How many owners could be bought that week (lib/culture/scoring.eligibilityOf); null on a
    // decision made before it was stored.
    eligibility?: CultureEligibility | null;
    feeds?: readonly string[];
    rationaleMd?: string | null;
};

type Props = {
    decision: PanelDecision | null;
    scope?: 'picker' | 'follow';
    emptyText?: string;
    // Under the items in place of the picker's rationale (the enrolled account's panel).
    note?: string;
    // Under the date for a decision that previewed (the enrolled account's panel).
    previewNote?: string;
};

const ACTION_STYLES: Record<DecisionAction, string> = {
    buy: 'text-brand bg-brand-strong/8',
    sell: 'text-negative bg-negative/8',
    hold: 'text-fg-soft bg-line-strong/25',
};

const ItemRow = ({item}: {item: GlossedDecisionItem}) => (
    <RowCard>
        <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap">
                <span className={cn('control-type capitalize text-[10px] px-2 py-1 rounded', ACTION_STYLES[item.action])}>{item.action}</span>
                <Link href={`/stocks/${encodeURIComponent(item.symbol)}`} className="text-sm font-bold text-fg font-mono hover:text-brand">{item.symbol}</Link>
                <span className="text-xs text-fg-muted font-mono">
                    target {(item.targetWeight * 100).toFixed(0)}% · score {item.score.toFixed(2)}
                </span>
            </div>
            <div className="flex items-center gap-2">
                {item.executed && (
                    <span className="text-[11px] text-brand font-mono">
                        filled{typeof item.executionPrice === 'number' ? ` @ ${formatPrice(item.executionPrice)}` : ''}
                    </span>
                )}
                {item.error && <span className="text-[11px] text-negative font-mono">{item.error}</span>}
            </div>
        </div>
        {item.brands.length > 0 && (
            <p className="mt-1.5 text-[11px] text-fg-muted font-mono inline-flex flex-wrap items-center gap-1.5" data-item-brands>
                <Term k="brand-owner">{CULTURE_PICKS_COPY.broughtBy}</Term>
                <BrandChips ids={item.brands.map((brand) => brand.id)} names={Object.fromEntries(item.brands.map((brand) => [brand.id, brand.name]))} />
            </p>
        )}
        {item.reasons.length > 0 && (
            <ul className="mt-2 space-y-0.5">
                {item.reasons.map((reason) => (
                    <li key={reason} className="text-[11px] text-fg-muted font-mono">
                        <span className={getChangeColorClass(1)}>·</span> {reason}
                    </li>
                ))}
            </ul>
        )}
        {item.gloss.length > 0 && (
            <Disclosure className="mt-2" data-culture-gloss summary={CULTURE_PICKS_COPY.glossSummary}>
                <ReasonGloss clauses={item.gloss} className="mt-2" />
            </Disclosure>
        )}
    </RowCard>
);

const PicksPanel = ({decision, scope = 'picker', emptyText = CULTURE_PICKS_COPY.decisionsEmpty, note, previewNote}: Props) => {
    if (!decision) {
        return <p className="text-sm text-fg-muted">{emptyText}</p>;
    }
    const hook = scope === 'follow' ? {'data-culture-follow-decision': decision.profile} : {'data-culture-decision': decision.profile};
    return (
        <div className="space-y-3" {...hook}>
            <p className="text-[11px] text-fg-muted font-mono flex flex-wrap items-center gap-2">
                <span>{decision.universe ? CULTURE_PICKS_COPY.decisionLine(decision.date, decision.universe.quoted, decision.universe.tickers) : decision.date}</span>
                {decision.eligibility && <span data-culture-eligible={decision.eligibility.eligible}>· {CULTURE_PICKS_COPY.eligibleLine(decision.eligibility.eligible)}</span>}
                {decision.feeds && <span>· {CULTURE_PICKS_COPY.feedsLine(decision.feeds)}</span>}
                {decision.kind === 'preview' && <Badge tone="warning">{CULTURE_PICKS_COPY.previewBadge}</Badge>}
                {decision.kind === 'skipped' && <Badge tone="neutral">{CULTURE_PICKS_COPY.skippedBadge}</Badge>}
            </p>
            {decision.kind === 'preview' && previewNote && <p className="text-xs text-fg-muted" data-follow-previewed>{previewNote}</p>}
            {decision.eligibility && decision.eligibility.eligible === 0 && decision.eligibility.total > 0 && (
                <p className="text-xs text-warning" data-culture-none-eligible>{CULTURE_PICKS_COPY.noneEligible(decision.eligibility)}</p>
            )}
            <div className="space-y-2">
                {decision.items.map((item) => <ItemRow key={`${item.symbol}-${item.action}`} item={item} />)}
            </div>
            {decision.rationaleMd && (
                <SafeMarkdown className={rowCard({tone: 'brand', className: 'text-sm text-fg-soft leading-relaxed'})}>
                    {decision.rationaleMd}
                </SafeMarkdown>
            )}
            {note && <p className="text-xs text-fg-muted">{note}</p>}
            <p className="label-type text-[length:var(--label-size)] text-fg-muted">{CULTURE_PICKS_COPY.footer}</p>
            <WhatTheseMean keys={PICKS_TERMS} />
        </div>
    );
};

export default PicksPanel;
