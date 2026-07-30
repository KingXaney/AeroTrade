'use client';

import {useState} from "react";
import {useRouter} from "next/navigation";
import ReactMarkdown from "react-markdown";
import {toast} from "sonner";
import {cn, formatPrice, getChangeColorClass} from "@/lib/utils";
import {applySuggestion} from "@/lib/actions/navigator.actions";

type SetView = {date: string; kind: 'executed' | 'preview'; items: SuggestionItem[]; rationaleMd: string | null};
type ApplyAccount = {id: string; name: string};

const ACTION_STYLES: Record<SuggestionAction, string> = {
    buy: 'text-[#7df4ff] bg-[rgba(0,240,255,0.08)]',
    sell: 'text-[#ffb4ab] bg-[rgba(255,180,171,0.08)]',
    hold: 'text-[#b9cacb] bg-[rgba(59,73,75,0.25)]',
};

const ItemRow = ({item, showApply, accounts}: {item: SuggestionItem; showApply: boolean; accounts: ApplyAccount[]}) => {
    const router = useRouter();
    const [applying, setApplying] = useState(false);
    const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');

    const onApply = async () => {
        if (applying || !accountId) return;
        setApplying(true);
        try {
            const result = await applySuggestion({symbol: item.symbol, action: item.action, targetWeight: item.targetWeight, accountId});
            if (result.success) {
                toast.success(result.message || 'Applied');
                router.refresh();
            } else {
                toast.error(result.message || 'Could not apply');
            }
        } finally {
            setApplying(false);
        }
    };

    return (
        <div className="px-4 py-3 rounded-lg border bg-[rgba(30,32,36,0.4)] border-[rgba(59,73,75,0.2)]">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                    <span className={cn('text-[10px] font-bold uppercase tracking-[0.1em] px-2 py-1 rounded', ACTION_STYLES[item.action])}
                          style={{fontFamily: 'var(--font-jetbrains)'}}>
                        {item.action}
                    </span>
                    <span className="text-sm font-bold text-[#e2e2e8]" style={{fontFamily: 'var(--font-jetbrains)'}}>{item.symbol}</span>
                    <span className="text-xs text-[#849495]" style={{fontFamily: 'var(--font-jetbrains)'}}>
                        target {(item.targetWeight * 100).toFixed(0)}% · score {item.score.toFixed(2)}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    {item.executed && (
                        <span className="text-[11px] text-[#7df4ff]" style={{fontFamily: 'var(--font-jetbrains)'}}>
                            filled{typeof item.executionPrice === 'number' ? ` @ ${formatPrice(item.executionPrice)}` : ''}
                        </span>
                    )}
                    {item.error && (
                        <span className="text-[11px] text-[#ffb4ab]" style={{fontFamily: 'var(--font-jetbrains)'}}>{item.error}</span>
                    )}
                    {showApply && item.action !== 'hold' && accounts.length > 0 && (
                        <>
                            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}
                                    className="text-[11px] rounded px-2 py-1 outline-none text-[#b9cacb]"
                                    style={{backgroundColor: '#111318', border: '1px solid rgba(59,73,75,0.4)', fontFamily: 'var(--font-jetbrains)'}}>
                                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                            <button type="button" onClick={() => void onApply()} disabled={applying}
                                    className="px-2.5 py-1 rounded text-[11px] font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
                                    style={{color: '#7df4ff', border: '1px solid rgba(125,244,255,0.35)', backgroundColor: 'rgba(0,240,255,0.06)', fontFamily: 'var(--font-jetbrains)'}}>
                                {applying ? 'Applying…' : 'Apply'}
                            </button>
                        </>
                    )}
                </div>
            </div>
            {item.reasons.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                    {item.reasons.map((reason) => (
                        <li key={reason} className="text-[11px] text-[#849495]" style={{fontFamily: 'var(--font-jetbrains)'}}>
                            <span className={getChangeColorClass(1)}>·</span> {reason}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

// Weekly decisions: the user's own executed set when enrolled, else the global model
// portfolio with one-click apply to any of the user's strategy accounts.
const SuggestionPanel = ({userSet, globalSet, accounts}: {userSet: SetView | null; globalSet: SetView | null; accounts: ApplyAccount[]}) => {
    const set = userSet ?? globalSet;

    if (!set) {
        return (
            <p className="text-sm text-[#849495]">
                No decisions yet — the navigator runs every Monday morning after the brain updates.
            </p>
        );
    }

    // Apply buttons show for the global model portfolio and for previews — both
    // are suggestions the user may act on; executed sets are a record, not advice.
    const showApply = userSet === null || userSet.kind === 'preview';
    return (
        <div className="space-y-3">
            <p className="text-[11px] text-[#849495]" style={{fontFamily: 'var(--font-jetbrains)'}}>
                {userSet ? 'Your AI account' : 'Global model portfolio'} · {set.date}
                {set.kind === 'preview' && (
                    <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-[0.08em] text-[#ffd700] bg-[rgba(255,215,0,0.08)]">
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
                <div className="px-4 py-3 rounded-lg border bg-[rgba(30,32,36,0.4)] border-[rgba(125,244,255,0.15)] text-sm text-[#b9cacb] leading-relaxed">
                    <ReactMarkdown>{set.rationaleMd}</ReactMarkdown>
                </div>
            )}
            <p className="text-[10px] uppercase tracking-[0.08em] text-[#849495]" style={{fontFamily: 'var(--font-jetbrains)'}}>
                Automated paper-trading experiment — not financial advice.
            </p>
        </div>
    );
};

export default SuggestionPanel;
