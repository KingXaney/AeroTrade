'use client';

import {useState} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {resetPaperAccount} from "@/lib/actions/accounts.actions";
import {formatPrice} from "@/lib/format";
import ConfirmDialog from "@/components/primitives/ConfirmDialog";
import ActionButton from "@/components/primitives/ActionButton";

// Resets one paper account to its starting balance. This was a click-twice toggle
// labelled "Click to confirm" that disarmed on blur — so it was really hover-and-click-
// twice, and neither label ever said what it destroys. resetPaperAccount clears the
// positions, deletes every PaperTrade and AccountSnapshot, and resets inceptionAt, which
// restarts the performance chart from today.
type Props = {
    accountId: string;
    accountName: string;
    startingBalance: number;
};

const ResetAccountButton = ({accountId, accountName, startingBalance}: Props) => {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);

    const onConfirm = async () => {
        setBusy(true);
        try {
            const result = await resetPaperAccount(accountId);
            if (result.success) {
                toast.success(result.message || 'Account reset');
                router.refresh();
            } else {
                toast.error(result.message || 'Reset failed');
            }
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <ActionButton variant="danger" className="tracking-wider" onClick={() => setOpen(true)} disabled={busy}>
                {busy ? 'Resetting…' : 'Reset Account'}
            </ActionButton>
            <ConfirmDialog
                open={open}
                onOpenChange={setOpen}
                title={`Reset “${accountName}”?`}
                description={`This permanently deletes every position, the entire trade history and all performance snapshots for this account, and restarts its record from today with ${formatPrice(startingBalance)} in cash. Export the trade history first if you want to keep it. This cannot be undone.`}
                confirmLabel="Reset account"
                destructive
                onConfirm={onConfirm}
            />
        </>
    );
};

export default ResetAccountButton;
