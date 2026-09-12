'use client';

import {useState} from "react";
import {usePathname, useRouter, useSearchParams} from "next/navigation";
import {toast} from "sonner";
import {cn, formatPrice, getChangeColorClass} from "@/lib/utils";
import {setActiveAccount} from "@/lib/actions/accounts.actions";
import {unpricedLabel} from "@/lib/trading/analytics";

export type ComparisonRow = {
    id: string;
    name: string;
    totalValue: number;
    totalReturnPct: number;
    winRatePct: number | null;
    maxDrawdownPct: number | null;
    unpriced?: number;        // holdings with no live quote — the return is partly at cost
    holdings?: number;
};

// The "which strategy wins" view: every strategy account side by side.
// Clicking a row makes that strategy the active one.
const AccountComparisonTable = ({rows, activeId}: {rows: ComparisonRow[]; activeId: string}) => {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [switching, setSwitching] = useState(false);

    const onPick = async (id: string) => {
        if (switching || id === activeId) return;
        setSwitching(true);
        try {
            const result = await setActiveAccount(id);
            if (result.success) {
                // A ?account= param outranks the cookie — clear it, or the switch
                // silently no-ops on bookmarked/deep-linked URLs.
                const params = new URLSearchParams(searchParams);
                if (params.has('account')) {
                    params.delete('account');
                    router.replace(params.size > 0 ? `${pathname}?${params.toString()}` : pathname);
                } else {
                    router.refresh();
                }
            } else {
                toast.error(result.message || 'Could not switch accounts');
            }
        } finally {
            setSwitching(false);
        }
    };

    const ranked = [...rows].sort((a, b) => b.totalReturnPct - a.totalReturnPct);

    return (
        <div className="space-y-2">
            <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-4 px-4 py-2 border-b border-line-strong/30"
                 style={{fontFamily: 'var(--type-mono)', fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-muted)'}}>
                <div>Strategy</div>
                <div className="text-right">Value</div>
                <div className="text-right">Total Return</div>
                <div className="text-right">Win Rate</div>
                <div className="text-right">Max Drawdown</div>
            </div>

            {ranked.map((row, i) => (
                <button
                    key={row.id}
                    type="button"
                    onClick={() => void onPick(row.id)}
                    disabled={switching}
                    className={cn(
                        'w-full grid grid-cols-2 md:grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 md:gap-4 items-center px-4 py-3 rounded-xl border text-left transition-colors disabled:opacity-60',
                        row.id === activeId
                            ? 'bg-brand-strong/6 border-brand/25'
                            : 'bg-surface-2/40 border-line-strong/20 hover:border-brand/30',
                    )}
                >
                    <div className="flex items-center gap-2">
                        <span className="text-xs w-4 text-fg-muted" style={{fontFamily: 'var(--type-mono)'}}>{i + 1}</span>
                        <span className={cn('text-sm font-semibold', row.id === activeId ? 'text-brand' : 'text-fg')}
                              style={{fontFamily: 'var(--type-display)'}}>
                            {row.name}
                        </span>
                    </div>
                    <div className="text-right text-sm text-fg" style={{fontFamily: 'var(--type-mono)'}}>
                        {formatPrice(row.totalValue)}
                    </div>
                    <div className="text-right" style={{fontFamily: 'var(--type-mono)'}}>
                        <div className={cn('text-sm', getChangeColorClass(row.totalReturnPct || undefined))}>
                            {row.totalReturnPct >= 0 ? '+' : ''}{row.totalReturnPct.toFixed(2)}%
                        </div>
                        {/* Ranked on the at-cost fallback like everything else; say so per row,
                            because the page-level note only covers the active strategy. */}
                        {unpricedLabel(row.unpriced ?? 0, row.holdings ?? 0) && (
                            <div className="text-[10px] text-warning">{unpricedLabel(row.unpriced ?? 0, row.holdings ?? 0)}</div>
                        )}
                    </div>
                    <div className="text-right text-sm text-fg-soft hidden md:block" style={{fontFamily: 'var(--type-mono)'}}>
                        {row.winRatePct === null ? '—' : `${row.winRatePct.toFixed(0)}%`}
                    </div>
                    <div className="text-right text-sm hidden md:block" style={{fontFamily: 'var(--type-mono)'}}>
                        {row.maxDrawdownPct === null
                            ? <span className="text-fg-soft">—</span>
                            : <span className={row.maxDrawdownPct > 0 ? 'text-negative' : 'text-fg-soft'}>−{row.maxDrawdownPct.toFixed(2)}%</span>}
                    </div>
                </button>
            ))}
        </div>
    );
};

export default AccountComparisonTable;
