'use client';

import {useState} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {closeOutHolding} from "@/lib/actions/trading.actions";
import {runWithToast} from "@/lib/action-toast";
import {formatPrice} from "@/lib/format";
import {GONE_AFTER_SESSIONS} from "@/lib/prices/gone";
import {GONE_COPY} from "@/lib/learn/copy/portfolio";
import ActionButton from "@/components/primitives/ActionButton";
import {useAccountSwitch} from "@/components/trading/accounts/useSwitchAccount";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from "@/components/ui/dialog";

// The one action a holding has once its symbol has stopped quoting (lib/prices/gone.ts): no
// order can fill at a live price, so the whole holding is closed at its last stored close. The
// dialog says which close, and what that price is not; the server decides again whether the
// symbol really has stopped (lib/trading/close-out.ts).
const CloseOutButton = ({accountId, symbol, quantity, close}: {accountId: string; symbol: string; quantity: number; close: {date: string; close: number}}) => {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [working, setWorking] = useState(false);
    // The holding is the old account's while another account is being opened.
    const {pending: switching} = useAccountSwitch(accountId);

    const confirm = async () => {
        if (working || switching) return;
        setWorking(true);
        const done = await runWithToast(() => closeOutHolding({accountId, symbol}), toast, {success: GONE_COPY.done, error: GONE_COPY.failed});
        setWorking(false);
        if (done) {
            setOpen(false);
            router.refresh();
        }
    };

    return (
        <>
            <ActionButton type="button" variant="secondary" size="sm" onClick={() => setOpen(true)} data-close-out={symbol}>
                {GONE_COPY.action}
            </ActionButton>
            <Dialog open={open} onOpenChange={(next) => !working && setOpen(next)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{GONE_COPY.title(symbol)}</DialogTitle>
                        <DialogDescription>{GONE_COPY.body(symbol, close.date, GONE_AFTER_SESSIONS)}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-fg-muted">{GONE_COPY.lastClose}</span>
                            <span className="text-fg font-mono">{formatPrice(close.close)}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm border-t border-line-strong/30 pt-3">
                            <span className="text-fg-muted">{GONE_COPY.proceeds}</span>
                            <span className="text-brand font-semibold font-mono">{formatPrice(close.close * quantity)}</span>
                        </div>
                        <p className="text-xs text-fg-muted">{GONE_COPY.caveat}</p>
                        <ActionButton type="button" variant="destructive" size="block" disabled={working || switching} onClick={confirm} data-close-out-confirm>
                            {working ? GONE_COPY.working : GONE_COPY.confirm(quantity)}
                        </ActionButton>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
};

export default CloseOutButton;
