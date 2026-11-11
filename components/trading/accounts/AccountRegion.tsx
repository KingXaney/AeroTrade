'use client';

import type {ReactNode} from "react";
import {cn} from "@/lib/utils";
import {useAccountSwitch} from "@/components/trading/accounts/useSwitchAccount";

// The part of a page that belongs to the active account — its figures, its holdings, the
// buttons that act on it. While another account is being opened it is the old account's: marked
// busy, out of reach (a Sell pressed now would land in the account on its way out), and, with
// `dim`, faded (.account-region[data-pending] in app/globals.css fades each panel's content,
// never the panel). The controls that make the switch stay outside it, so focus stays on them.
const AccountRegion = ({activeId, dim = true, className, children}: {
    activeId: string;
    dim?: boolean;
    className?: string;
    children: ReactNode;
}) => {
    const {pending} = useAccountSwitch(activeId);
    return (
        <div
            className={cn('account-region', className)}
            aria-busy={pending || undefined}
            inert={pending || undefined}
            data-pending={pending && dim ? '' : undefined}
        >
            {children}
        </div>
    );
};

export default AccountRegion;
