'use client';

import {useState} from "react";
import {useRouter} from "next/navigation";
import SafeMarkdown from "@/components/primitives/SafeMarkdown";
import Disclosure from "@/components/primitives/Disclosure";
import {toast} from "sonner";
import {cn} from "@/lib/utils";
import {formatPrice, getChangeColorClass} from "@/lib/format";
import {applySuggestion} from "@/lib/actions/navigator.actions";
import {runWithToast} from "@/lib/action-toast";
import type {ReasonClause} from "@/lib/learn/reasons";
import type {ApplyAccount} from "@/lib/trading/active-account";
import {NAVIGATOR_COPY} from "@/lib/learn/copy/navigator";
import ReasonGloss from "@/components/learn/ReasonGloss";
import type {SuggestionAction, SuggestionItem} from '@/lib/navigator/types';
import RowCard, {rowCard} from "@/components/primitives/RowCard";
import {FIELD_STYLE, fieldClass} from "@/components/primitives/TextField";

// `gloss`: the item's reasons decoded on the server (glossNavigatorReasons), so this client
// file never bundles the grammar. /brain passes it; the weekly-decisions widget does not.
type GlossedItem = SuggestionItem & {gloss?: ReasonClause[]};
type SetView = {date: string; kind: 'executed' | 'preview'; items: GlossedItem[]; rationaleMd: string | null};

const ACTION_STYLES: Record<SuggestionAction, string> = {
    buy: 'text-brand bg-brand-strong/8',
    sell: 'text-negative bg-negative/8',
    hold: 'text-fg-soft bg-line-strong/25',
};

const ItemRow = ({item, showApply, accounts}: {item: GlossedItem; showApply: boolean; accounts: ApplyAccount[]}) => {
    const router = useRouter();
    const [applying, setApplying] = useState(false);
    const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');

    const onApply = async () => {
        if (applying || !accountId) return;
        setApplying(true);
        try {
            const apply = () => applySuggestion({symbol: item.symbol, action: item.action, targetWeight: item.targetWeight, accountId});
            if (await runWithToast(apply, toast, {success: 'Applied', error: 'Could not apply'})) {
                router.refresh();
            }
        } finally {
            setApplying(false);
        }
    };

    return (
        <RowCard>
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                    <span className={cn('font-mono text-[10px] font-bold uppercase tracking-[0.1em] px-2 py-1 rounded', ACTION_STYLES[item.action])}>
                        {item.action}
                    </span>
                    <span className="text-sm font-bold text-fg font-mono">{item.symbol}</span>
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
                    {item.error && (
                        <span className="text-[11px] text-negative font-mono">{item.error}</span>
                    )}
                    {showApply && item.action !== 'hold' && accounts.length > 0 && (
                        <>
                            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}
                                    className={fieldClass('text-[11px] rounded px-2 py-1 text-fg-soft')} style={FIELD_STYLE}>
                                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                            <button type="button" onClick={() => void onApply()} disabled={applying}
                                    className="px-2.5 py-1 rounded text-[11px] font-bold uppercase tracking-wider transition-colors disabled:opacity-50 font-mono"
                                    style={{color: 'var(--brand)', border: '1px solid color-mix(in srgb, var(--brand) 35%, transparent)', backgroundColor: 'color-mix(in srgb, var(--brand-strong) 6%, transparent)'}}>
                                {applying ? 'Applying…' : 'Apply'}
                            </button>
                        </>
                    )}
                </div>
            </div>
            {item.reasons.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                    {item.reasons.map((reason) => (
                        <li key={reason} className="text-[11px] text-fg-muted font-mono">
                            <span className={getChangeColorClass(1)}>·</span> {reason}
                        </li>
                    ))}
                </ul>
            )}
            {/* One disclosure per decision: each reason's clauses read in plain words. */}
            {item.gloss && item.gloss.length > 0 && (
                <Disclosure className="mt-2" data-navigator-gloss summary={NAVIGATOR_COPY.glossSummary}>
                    <ReasonGloss clauses={item.gloss} className="mt-2" />
                </Disclosure>
            )}
        </RowCard>
    );
};

// Weekly decisions: the user's own executed set when enrolled, else the global model
// portfolio with one-click apply to any of the user's paper accounts.
const SuggestionPanel = ({userSet, globalSet, accounts}: {userSet: SetView | null; globalSet: SetView | null; accounts: ApplyAccount[]}) => {
    const set = userSet ?? globalSet;

    if (!set) {
        return (
            <p className="text-sm text-fg-muted">
                No decisions yet — the navigator runs every Monday morning after the brain updates.
            </p>
        );
    }

    // Apply buttons show for the global model portfolio and for previews — both
    // are suggestions the user may act on; executed sets are a record, not advice.
    const showApply = userSet === null || userSet.kind === 'preview';
    return (
        <div className="space-y-3">
            <p className="text-[11px] text-fg-muted font-mono">
                {userSet ? 'Your AI account' : 'Global model portfolio'} · {set.date}
                {set.kind === 'preview' && (
                    <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-[0.08em] text-warning bg-warning/10">
                        Preview — nothing traded
                    </span>
                )}
            </p>
            <div className="space-y-2">
                {set.items.map((item) => (
                    <ItemRow key={`${item.symbol}-${item.action}`} item={item} showApply={showApply} accounts={accounts} />
                ))}
            </div>
            {set.rationaleMd && (
                <SafeMarkdown className={rowCard({tone: 'brand', className: 'text-sm text-fg-soft leading-relaxed'})}>
                    {set.rationaleMd}
                </SafeMarkdown>
            )}
            <p className="text-[10px] uppercase tracking-[0.08em] text-fg-muted font-mono">
                Automated paper-trading experiment — not financial advice.
            </p>
        </div>
    );
};

export default SuggestionPanel;
