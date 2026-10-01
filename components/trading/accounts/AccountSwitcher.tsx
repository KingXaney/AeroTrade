'use client';

import {useState} from "react";
import {cn} from "@/lib/utils";
import {formatChangePercent, getChangeColorClass} from "@/lib/format";
import {unpricedLabel} from "@/lib/trading/analytics";
import type {SwitcherAccount} from "@/lib/trading/active-account";
import CreateAccountDialog from "@/components/trading/accounts/CreateAccountDialog";
import useSwitchAccount from "@/components/trading/accounts/useSwitchAccount";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Dropdown to switch between the user's paper accounts. Lives in the /trade and /portfolio headers
// and on the dashboard; the active account is stored in an HTTP-only cookie.
const AccountSwitcher = ({accounts, activeId}: {accounts: SwitcherAccount[]; activeId: string}) => {
    const {switching, switchTo} = useSwitchAccount(activeId);
    const [creating, setCreating] = useState(false);

    const active = accounts.find((a) => a.id === activeId) ?? accounts[0];

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        disabled={switching}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-[0.1em] text-fg hover:text-brand transition-colors disabled:opacity-50"
                        style={{border: '1px solid color-mix(in srgb, var(--line-strong) 40%, transparent)', backgroundColor: 'color-mix(in srgb, var(--surface-2) 40%, transparent)', fontFamily: 'var(--type-mono)'}}
                    >
                        <span className="material-symbols-outlined text-base">account_tree</span>
                        {active?.name ?? 'Account'}
                        <span className="material-symbols-outlined text-base">expand_more</span>
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-surface-1 border-line-strong/50 min-w-[220px]">
                    {accounts.map((a) => (
                        <DropdownMenuItem
                            key={a.id}
                            onSelect={() => void switchTo(a.id)}
                            className="flex items-center justify-between gap-4 cursor-pointer focus:bg-brand-strong/6"
                        >
                            <span className={cn('text-sm', a.id === activeId ? 'text-brand font-bold' : 'text-fg')}
                                  style={{fontFamily: 'var(--type-mono)'}}>
                                {a.name}
                            </span>
                            {typeof a.totalReturnPct === 'number' && (
                                <span className="text-xs text-right" style={{fontFamily: 'var(--type-mono)'}}>
                                    <span className={getChangeColorClass(a.totalReturnPct)}>
                                        {formatChangePercent(a.totalReturnPct)}
                                    </span>
                                    {unpricedLabel(a.unpriced ?? 0, a.holdings ?? 0) && (
                                        <span className="block text-[10px] text-warning">{unpricedLabel(a.unpriced ?? 0, a.holdings ?? 0)}</span>
                                    )}
                                </span>
                            )}
                        </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator className="bg-line-strong/40" />
                    <DropdownMenuItem
                        onSelect={() => setCreating(true)}
                        className="cursor-pointer text-brand focus:bg-brand-strong/6"
                    >
                        <span className="text-sm" style={{fontFamily: 'var(--type-mono)'}}>＋ New account</span>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            {creating && <CreateAccountDialog onClose={() => setCreating(false)} />}
        </>
    );
};

export default AccountSwitcher;
