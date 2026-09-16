'use client';

import {useState} from "react";
import {toast} from "sonner";
import {Loader2} from "lucide-react";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {cn} from "@/lib/utils";

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description: string;
    confirmLabel: string;
    destructive?: boolean;
    onConfirm: () => Promise<void> | void;
};

const ConfirmDialog = ({open, onOpenChange, title, description, confirmLabel, destructive = false, onConfirm}: Props) => {
    const [busy, setBusy] = useState(false);
    const confirm = async () => {
        setBusy(true);
        try {
            await onConfirm();
            onOpenChange(false);
        } catch (error) {
            // The close used to sit between the await and the finally, so a rejecting
            // onConfirm escaped the component entirely and took out the whole route via
            // its error boundary. Keep the dialog open so the action can be retried.
            console.error('Confirm action failed:', error);
            toast.error('That didn’t go through — check your connection and try again');
        } finally {
            setBusy(false);
        }
    };
    return (
        // Don't let a click-away or Escape dismiss it mid-flight.
        <Dialog open={open} onOpenChange={(next) => { if (!next && busy) return; onOpenChange(next); }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle style={{fontFamily: 'var(--type-display)'}}>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                <div className="mt-2 flex justify-end gap-2" style={{fontFamily: 'var(--type-mono)'}}>
                    {/* Cancel first so keyboard users land on the safe action. */}
                    <button type="button" autoFocus onClick={() => onOpenChange(false)} disabled={busy}
                            className="px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-[0.1em] text-fg-soft hover:text-fg border border-line-strong/40">
                        Cancel
                    </button>
                    <button type="button" onClick={confirm} disabled={busy}
                            className={cn('inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-[0.1em] disabled:opacity-50',
                                destructive ? 'bg-negative/15 text-negative border border-negative/30' : 'bg-brand text-on-brand')}>
                        {busy && <Loader2 className="size-3.5 animate-spin" />}
                        {confirmLabel}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default ConfirmDialog;
