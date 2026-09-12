'use client';

import {useState} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {resetPaperAccount} from "@/lib/actions/trading.actions";
import {formatPrice} from "@/lib/utils";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

// Resets one strategy account to its starting balance. This was a click-twice toggle
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
                toast.success(result.message || 'Strategy reset');
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
            <button
                type="button"
                onClick={() => setOpen(true)}
                disabled={busy}
                className="px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-fg-soft hover:text-negative transition-colors disabled:opacity-50"
                style={{border: '1px solid color-mix(in srgb, var(--line-strong) 40%, transparent)', fontFamily: 'var(--type-mono)'}}
            >
                {busy ? 'Resetting…' : 'Reset Strategy'}
            </button>
            <ConfirmDialog
                open={open}
                onOpenChange={setOpen}
                title={`Reset “${accountName}”?`}
                description={`This permanently deletes every position, the entire trade history and all performance snapshots for this strategy, and restarts its record from today with ${formatPrice(startingBalance)} in cash. Export the trade history first if you want to keep it. This cannot be undone.`}
                confirmLabel="Reset strategy"
                destructive
                onConfirm={onConfirm}
            />
        </>
    );
};

export default ResetAccountButton;
