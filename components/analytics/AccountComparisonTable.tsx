'use client';

import {useState} from "react";
import {usePathname, useRouter, useSearchParams} from "next/navigation";
import {toast} from "sonner";
import {cn, formatPrice, getChangeColorClass} from "@/lib/utils";
import {setActiveAccount} from "@/lib/actions/accounts.actions";

export type ComparisonRow = {
    id: string;
    name: string;
    totalValue: number;
    totalReturnPct: number;
    winRatePct: number | null;
    maxDrawdownPct: number | null;
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
            <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-4 px-4 py-2 border-b border-[rgba(59,73,75,0.3)]"
                 style={{fontFamily: 'var(--font-jetbrains)', fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#849495'}}>
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
                            ? 'bg-[rgba(0,240,255,0.06)] border-[rgba(125,244,255,0.25)]'
                            : 'bg-[rgba(30,32,36,0.4)] border-[rgba(59,73,75,0.2)] hover:border-[rgba(125,244,255,0.3)]',
                    )}
                >
                    <div className="flex items-center gap-2">
                        <span className="text-xs w-4 text-[#849495]" style={{fontFamily: 'var(--font-jetbrains)'}}>{i + 1}</span>
                        <span className={cn('text-sm font-semibold', row.id === activeId ? 'text-[#7df4ff]' : 'text-[#e2e2e8]')}
                              style={{fontFamily: 'var(--font-sora)'}}>
                            {row.name}
                        </span>
                    </div>
                    <div className="text-right text-sm text-[#e2e2e8]" style={{fontFamily: 'var(--font-jetbrains)'}}>
                        {formatPrice(row.totalValue)}
                    </div>
                    <div className={cn('text-right text-sm', getChangeColorClass(row.totalReturnPct || undefined))}
                         style={{fontFamily: 'var(--font-jetbrains)'}}>
                        {row.totalReturnPct >= 0 ? '+' : ''}{row.totalReturnPct.toFixed(2)}%
                    </div>
                    <div className="text-right text-sm text-[#b9cacb] hidden md:block" style={{fontFamily: 'var(--font-jetbrains)'}}>
                        {row.winRatePct === null ? '—' : `${row.winRatePct.toFixed(0)}%`}
                    </div>
                    <div className="text-right text-sm hidden md:block" style={{fontFamily: 'var(--font-jetbrains)'}}>
                        {row.maxDrawdownPct === null
                            ? <span className="text-[#b9cacb]">—</span>
                            : <span className={row.maxDrawdownPct > 0 ? 'text-[#ffb4ab]' : 'text-[#b9cacb]'}>−{row.maxDrawdownPct.toFixed(2)}%</span>}
                    </div>
                </button>
            ))}
        </div>
    );
};

export default AccountComparisonTable;
