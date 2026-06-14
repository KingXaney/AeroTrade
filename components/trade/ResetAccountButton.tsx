'use client';

import {useState} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {resetPaperAccount} from "@/lib/actions/trading.actions";

// Resets the paper account back to the $100k starting balance (clears positions + history).
const ResetAccountButton = () => {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [confirming, setConfirming] = useState(false);

    const onReset = async () => {
        if (!confirming) { setConfirming(true); return; }
        setBusy(true);
        try {
            const result = await resetPaperAccount();
            if (result.success) {
                toast.success(result.message || 'Account reset');
                router.refresh();
            } else {
                toast.error(result.message || 'Reset failed');
            }
        } finally {
            setBusy(false);
            setConfirming(false);
        }
    };

    return (
        <button
            type="button"
            onClick={onReset}
            onBlur={() => setConfirming(false)}
            disabled={busy}
            className="px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-[#b9cacb] hover:text-[#ffb4ab] transition-colors disabled:opacity-50"
            style={{border: '1px solid rgba(59,73,75,0.4)', fontFamily: 'var(--font-jetbrains)'}}
        >
            {busy ? 'Resetting…' : confirming ? 'Click to confirm' : 'Reset Account'}
        </button>
    );
};

export default ResetAccountButton;
