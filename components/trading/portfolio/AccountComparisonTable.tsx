'use client';

import {cn} from "@/lib/utils";
import {formatDrawdown, formatPct, roundPct, formatPrice, getChangeColorClass} from "@/lib/format";
import {unpricedLabel} from "@/lib/trading/analytics";
import type {ComparisonRow} from "@/lib/trading/active-account";
import useSwitchAccount from "@/components/trading/accounts/useSwitchAccount";
import {rowCard} from "@/components/primitives/RowCard";

// The "which account wins" view: every one of the user's paper accounts side by side.
// Clicking a row makes that account the active one.
const AccountComparisonTable = ({rows, activeId}: {rows: ComparisonRow[]; activeId: string}) => {
    const {switching, switchTo} = useSwitchAccount(activeId);

    const ranked = [...rows].sort((a, b) => b.totalReturnPct - a.totalReturnPct);

    return (
        <div className="space-y-2">
            <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-4 px-4 py-2 border-b border-line-strong/30 font-mono"
                 style={{fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-muted)'}}>
                <div>Account</div>
                <div className="text-right">Value</div>
                <div className="text-right">Total Return</div>
                <div className="text-right">Win Rate</div>
                <div className="text-right">Max Drawdown</div>
            </div>

            {ranked.map((row, i) => (
                <button
                    key={row.id}
                    type="button"
                    onClick={() => void switchTo(row.id)}
                    disabled={switching}
                    className={rowCard({
                        tone: row.id === activeId ? 'selected' : 'plain',
                        interactive: row.id !== activeId,
                        className: 'w-full grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-1.5 md:gap-4 items-center rounded-xl text-left transition-colors disabled:opacity-60',
                    })}
                >
                    <div className="flex items-center gap-2">
                        <span className="text-xs w-4 text-fg-muted font-mono">{i + 1}</span>
                        <span className={cn('font-heading text-sm font-semibold', row.id === activeId ? 'text-brand' : 'text-fg')}>
                            {row.name}
                        </span>
                    </div>
                    {/* Below md the header row is hidden, so each cell names itself. */}
                    <div className="flex justify-between md:block md:text-right text-sm text-fg font-mono">
                        <span className="md:hidden text-[10px] uppercase tracking-[0.1em] text-fg-muted mr-2">Value</span>
                        {formatPrice(row.totalValue)}
                    </div>
                    <div className="flex justify-between md:block md:text-right font-mono">
                        <span className="md:hidden text-[10px] uppercase tracking-[0.1em] text-fg-muted mr-2">Total Return</span>
                        <div className="text-right">
                        <div className={cn('text-sm', getChangeColorClass(row.totalReturnPct))}>
                            {formatPct(row.totalReturnPct)}
                        </div>
                        {/* Ranked on the at-cost fallback like everything else; say so per row,
                            because the page-level note only covers the active account. */}
                        {unpricedLabel(row.unpriced, row.holdings) && (
                            <div className="text-[10px] text-warning">{unpricedLabel(row.unpriced, row.holdings)}</div>
                        )}
                        </div>
                    </div>
                    {/* These two used to be hidden below md — the very numbers that make a
                        account comparison a comparison. */}
                    <div className="flex justify-between md:block md:text-right text-sm text-fg-soft font-mono">
                        <span className="md:hidden text-[10px] uppercase tracking-[0.1em] text-fg-muted mr-2">Win Rate</span>
                        {row.winRatePct === null ? '—' : `${row.winRatePct.toFixed(0)}%`}
                    </div>
                    <div className="flex justify-between md:block md:text-right text-sm font-mono">
                        <span className="md:hidden text-[10px] uppercase tracking-[0.1em] text-fg-muted mr-2">Max Drawdown</span>
                        {row.maxDrawdownPct === null
                            ? <span className="text-fg-soft">—</span>
                            : <span className={roundPct(row.maxDrawdownPct) > 0 ? 'text-negative' : 'text-fg-soft'}>{formatDrawdown(row.maxDrawdownPct)}</span>}
                    </div>
                </button>
            ))}
        </div>
    );
};

export default AccountComparisonTable;
