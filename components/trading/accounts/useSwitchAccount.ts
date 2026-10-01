'use client';

import {useState} from "react";
import {usePathname, useRouter, useSearchParams} from "next/navigation";
import {toast} from "sonner";
import {setActiveAccount} from "@/lib/actions/accounts.actions";

// Makes another account the active one (the HTTP-only cookie) and re-renders the page on it —
// the account switcher's dropdown and the comparison table's rows. `switching` is true while
// the action runs; a pick of the active account, or one made mid-switch, does nothing.
const useSwitchAccount = (activeId: string) => {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [switching, setSwitching] = useState(false);

    const switchTo = async (id: string) => {
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

    return {switching, switchTo};
};

export default useSwitchAccount;
