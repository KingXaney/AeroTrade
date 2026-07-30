'use client';

import {useState} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {createPaperAccount} from "@/lib/actions/accounts.actions";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from "@/components/ui/dialog";

// Name a new strategy account. Mounted conditionally by AccountSwitcher so every
// open starts with fresh state (same pattern as SellPositionDialog).
const CreateAccountDialog = ({onClose}: {onClose: () => void}) => {
    const router = useRouter();
    const [name, setName] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const valid = name.trim().length > 0 && name.trim().length <= 40;

    const onConfirm = async () => {
        if (submitting || !valid) return;
        setSubmitting(true);
        try {
            const result = await createPaperAccount({name});
            if (result.success) {
                toast.success(result.message || 'Strategy created');
                onClose();
                router.refresh();
            } else {
                toast.error(result.message || 'Could not create the strategy');
            }
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open onOpenChange={(open) => { if (!open && !submitting) onClose(); }}>
            <DialogContent className="bg-[#14171b] ring-[rgba(255,255,255,0.06)] sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle className="text-sm font-bold uppercase tracking-[0.1em] text-[#7df4ff]" style={{fontFamily: 'var(--font-jetbrains)'}}>
                        New Strategy Account
                    </DialogTitle>
                    <DialogDescription className="text-[#849495]">
                        Each strategy gets its own $100,000 paper account so you can compare how they perform.
                    </DialogDescription>
                </DialogHeader>

                <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void onConfirm(); }}>
                    <div>
                        <label htmlFor="account-name" className="text-[10px] uppercase tracking-[0.1em] text-[#849495]" style={{fontFamily: 'var(--font-jetbrains)'}}>
                            Strategy name
                        </label>
                        <input
                            id="account-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Dividend Picks"
                            maxLength={40}
                            autoComplete="off"
                            autoFocus
                            className="w-full mt-1 rounded-lg px-3 py-2 text-sm text-[#e2e2e8] outline-none"
                            style={{backgroundColor: '#111318', border: '1px solid rgba(59,73,75,0.4)', fontFamily: 'var(--font-jetbrains)'}}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={submitting || !valid}
                        className="w-full py-3 rounded-lg text-sm font-bold uppercase tracking-wider transition-all active:scale-[0.98] disabled:opacity-50 text-[#002022]"
                        style={{
                            fontFamily: 'var(--font-jetbrains)',
                            backgroundColor: '#00f0ff',
                            boxShadow: '0 0 15px rgba(0,240,255,0.3)',
                        }}
                    >
                        {submitting ? 'Creating…' : 'Create Strategy'}
                    </button>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default CreateAccountDialog;
