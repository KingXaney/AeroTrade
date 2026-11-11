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
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Dropdown to switch between the user's paper accounts. Lives in the /trade and /portfolio headers
// and on the dashboard; the active account is stored in an HTTP-only cookie. The trigger names
// the account picked from the click on, and stays focusable while the page follows.
const AccountSwitcher = ({accounts, activeId}: {accounts: SwitcherAccount[]; activeId: string}) => {
    const {shownId, pending, switchTo} = useSwitchAccount(activeId);
    const [creating, setCreating] = useState(false);

    const active = accounts.find((a) => a.id === shownId) ?? accounts.find((a) => a.id === activeId) ?? accounts[0];

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        aria-busy={pending || undefined}
                        data-account-switcher={shownId}
                        className="control-type inline-flex items-center gap-2 px-3 py-2 max-lg:min-h-11 rounded-lg text-xs text-fg hover:text-brand transition-colors border border-line-strong/40 bg-surface-2/40"
                    >
                        <span className="material-symbols-outlined text-base">account_tree</span>
                        {active?.name ?? 'Account'}
                        <span className="material-symbols-outlined text-base">expand_more</span>
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-surface-1 border-line-strong/50 min-w-[260px]">
                    {/* One of several, one chosen: radio items, so the account shown is announced
                        as checked rather than left to its colour. */}
                    <DropdownMenuRadioGroup value={shownId} onValueChange={(id) => void switchTo(id)}>
                    {accounts.map((a) => (
                        <DropdownMenuRadioItem
                            key={a.id}
                            value={a.id}
                            className="flex items-center justify-between gap-4 cursor-pointer max-lg:min-h-11 focus:bg-brand-strong/6"
                        >
                            <span className={cn('font-mono text-sm whitespace-nowrap', a.id === shownId ? 'text-brand font-bold' : 'text-fg')}>
                                {a.name}
                            </span>
                            {typeof a.totalReturnPct === 'number' && (
                                <span className="text-xs text-right font-mono">
                                    <span className={getChangeColorClass(a.totalReturnPct)}>
                                        {formatChangePercent(a.totalReturnPct)}
                                    </span>
                                    {unpricedLabel(a.unpriced ?? 0, a.holdings ?? 0) && (
                                        <span className="block text-[10px] text-warning">{unpricedLabel(a.unpriced ?? 0, a.holdings ?? 0)}</span>
                                    )}
                                </span>
                            )}
                        </DropdownMenuRadioItem>
                    ))}
                    </DropdownMenuRadioGroup>
                    <DropdownMenuSeparator className="bg-line-strong/40" />
                    <DropdownMenuItem
                        onSelect={() => setCreating(true)}
                        className="cursor-pointer max-lg:min-h-11 text-brand focus:bg-brand-strong/6"
                    >
                        <span className="text-sm font-mono">＋ New account</span>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            {creating && <CreateAccountDialog onClose={() => setCreating(false)} />}
        </>
    );
};

export default AccountSwitcher;
