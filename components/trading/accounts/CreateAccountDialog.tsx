'use client';

import {useState} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {createPaperAccount} from "@/lib/actions/accounts.actions";
import {PAPER_STARTING_BALANCE, STARTING_BALANCE_RANGE, resolveStartingBalance} from "@/lib/trading/starting-balance";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import ActionButton from "@/components/primitives/ActionButton";
import TextField from "@/components/primitives/TextField";

// Name a new paper account and pick its starting balance. Mounted conditionally
// by AccountSwitcher so every open starts with fresh state (same pattern as
// SellPositionDialog).
const CreateAccountDialog = ({onClose}: {onClose: () => void}) => {
    const router = useRouter();
    const [name, setName] = useState('');
    const [balance, setBalance] = useState(String(PAPER_STARTING_BALANCE));
    const [submitting, setSubmitting] = useState(false);

    const balanceNum = balance === '' ? 0 : parseInt(balance, 10);
    const balanceValid = resolveStartingBalance(balanceNum) !== null;
    const valid = name.trim().length > 0 && name.trim().length <= 40 && balanceValid;

    const onConfirm = async () => {
        if (submitting || !valid) return;
        setSubmitting(true);
        try {
            const result = await createPaperAccount({name, startingBalance: balanceNum});
            if (result.success) {
                toast.success(result.message || 'Account created');
                onClose();
                router.refresh();
            } else {
                toast.error(result.message || 'Could not create the account');
            }
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open onOpenChange={(open) => { if (!open && !submitting) onClose(); }}>
            <DialogContent className="bg-surface-1 ring-line sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle className="text-sm font-bold uppercase tracking-[0.1em] text-brand font-mono">
                        New Account
                    </DialogTitle>
                    <DialogDescription className="text-fg-muted">
                        Each account holds its own cash, positions and record, so you can compare how they perform. Returns are tracked in %, so any starting balance stays comparable.
                    </DialogDescription>
                </DialogHeader>

                <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void onConfirm(); }}>
                    <div>
                        <label htmlFor="account-name" className="text-[10px] uppercase tracking-[0.1em] text-fg-muted font-mono">
                            Account name
                        </label>
                        <TextField
                            id="account-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Dividend Picks"
                            maxLength={40}
                            autoComplete="off"
                            autoFocus
                            className="w-full mt-1"
                        />
                    </div>

                    <div>
                        <label htmlFor="account-balance" className="text-[10px] uppercase tracking-[0.1em] text-fg-muted font-mono">
                            Starting balance ($)
                        </label>
                        <TextField
                            id="account-balance"
                            value={balance}
                            onChange={(e) => setBalance(e.target.value.replace(/[^0-9]/g, ''))}
                            inputMode="numeric"
                            autoComplete="off"
                            className="w-full mt-1"
                        />
                        {!balanceValid && balance !== '' && (
                            <p className="mt-1 text-xs text-negative">
                                Between {STARTING_BALANCE_RANGE}
                            </p>
                        )}
                    </div>

                    <ActionButton type="submit" variant="strong" size="block" glow disabled={submitting || !valid}>
                        {submitting ? 'Creating…' : `Create with $${(balanceNum || 0).toLocaleString('en-US')}`}
                    </ActionButton>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default CreateAccountDialog;
