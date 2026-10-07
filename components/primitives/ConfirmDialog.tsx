'use client';

import {useState} from "react";
import {toast} from "sonner";
import {Loader2} from "lucide-react";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {cn} from "@/lib/utils";
import ActionButton from "@/components/primitives/ActionButton";

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description: string;
    confirmLabel: string;
    destructive?: boolean;
    onConfirm: () => Promise<void> | void;
    // Where the focus goes as it closes (Radix's onCloseAutoFocus): by default back to the trigger.
    onCloseAutoFocus?: (event: Event) => void;
};

const ConfirmDialog = ({open, onOpenChange, title, description, confirmLabel, destructive = false, onConfirm, onCloseAutoFocus}: Props) => {
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
            <DialogContent className="sm:max-w-md" onCloseAutoFocus={onCloseAutoFocus}>
                <DialogHeader>
                    <DialogTitle className="font-heading">{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                <div className="mt-2 flex justify-end gap-2 font-mono">
                    {/* Cancel first so keyboard users land on the safe action. */}
                    <ActionButton variant="secondary" autoFocus onClick={() => onOpenChange(false)} disabled={busy}>
                        Cancel
                    </ActionButton>
                    <ActionButton onClick={confirm} disabled={busy}
                                  className={cn('inline-flex items-center gap-2', destructive && 'bg-negative/15 text-negative border border-negative/30')}>
                        {busy && <Loader2 className="size-3.5 animate-spin" />}
                        {confirmLabel}
                    </ActionButton>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default ConfirmDialog;
