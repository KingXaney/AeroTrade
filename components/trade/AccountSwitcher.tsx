'use client';

import {useState} from "react";
import {usePathname, useRouter, useSearchParams} from "next/navigation";
import {toast} from "sonner";
import {cn, formatChangePercent, getChangeColorClass} from "@/lib/utils";
import {setActiveAccount} from "@/lib/actions/accounts.actions";
import CreateAccountDialog from "@/components/trade/CreateAccountDialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type SwitcherAccount = {
    id: string;
    name: string;
    totalReturnPct?: number;
};

// Dropdown to switch between strategy accounts. Lives in the /trade and
// /portfolio headers; the active account is stored in an HTTP-only cookie.
const AccountSwitcher = ({accounts, activeId}: {accounts: SwitcherAccount[]; activeId: string}) => {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [creating, setCreating] = useState(false);
    const [switching, setSwitching] = useState(false);

    const active = accounts.find((a) => a.id === activeId) ?? accounts[0];

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

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        disabled={switching}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-[0.1em] text-[#e2e2e8] hover:text-[#7df4ff] transition-colors disabled:opacity-50"
                        style={{border: '1px solid rgba(59,73,75,0.4)', backgroundColor: 'rgba(30,32,36,0.4)', fontFamily: 'var(--font-jetbrains)'}}
                    >
                        <span className="material-symbols-outlined text-base">account_tree</span>
                        {active?.name ?? 'Strategy'}
                        <span className="material-symbols-outlined text-base">expand_more</span>
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-[#14171b] border-[rgba(59,73,75,0.5)] min-w-[220px]">
                    {accounts.map((a) => (
                        <DropdownMenuItem
                            key={a.id}
                            onSelect={() => void onPick(a.id)}
                            className="flex items-center justify-between gap-4 cursor-pointer focus:bg-[rgba(0,240,255,0.06)]"
                        >
                            <span className={cn('text-sm', a.id === activeId ? 'text-[#7df4ff] font-bold' : 'text-[#e2e2e8]')}
                                  style={{fontFamily: 'var(--font-jetbrains)'}}>
                                {a.name}
                            </span>
                            {typeof a.totalReturnPct === 'number' && (
                                <span className={cn('text-xs', getChangeColorClass(a.totalReturnPct || undefined))}
                                      style={{fontFamily: 'var(--font-jetbrains)'}}>
                                    {formatChangePercent(a.totalReturnPct) || '0.00%'}
                                </span>
                            )}
                        </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator className="bg-[rgba(59,73,75,0.4)]" />
                    <DropdownMenuItem
                        onSelect={() => setCreating(true)}
                        className="cursor-pointer text-[#7df4ff] focus:bg-[rgba(0,240,255,0.06)]"
                    >
                        <span className="text-sm" style={{fontFamily: 'var(--font-jetbrains)'}}>＋ New strategy account</span>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            {creating && <CreateAccountDialog onClose={() => setCreating(false)} />}
        </>
    );
};

export default AccountSwitcher;
