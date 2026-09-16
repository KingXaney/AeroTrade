'use client';

import {useState} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {renamePaperAccount, deletePaperAccount} from "@/lib/actions/accounts.actions";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Rename dialog — mounted conditionally so state resets per open.
const RenameDialog = ({accountId, currentName, onClose}: {accountId: string; currentName: string; onClose: () => void}) => {
    const router = useRouter();
    const [name, setName] = useState(currentName);
    const [submitting, setSubmitting] = useState(false);
    const valid = name.trim().length > 0 && name.trim().length <= 40;

    const onConfirm = async () => {
        if (submitting || !valid) return;
        setSubmitting(true);
        try {
            const result = await renamePaperAccount({accountId, name});
            if (result.success) {
                toast.success(result.message || 'Renamed');
                onClose();
                router.refresh();
            } else {
                toast.error(result.message || 'Rename failed');
            }
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open onOpenChange={(open) => { if (!open && !submitting) onClose(); }}>
            <DialogContent className="bg-surface-1 ring-line sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle className="text-sm font-bold uppercase tracking-[0.1em] text-brand" style={{fontFamily: 'var(--type-mono)'}}>
                        Rename Strategy
                    </DialogTitle>
                    <DialogDescription className="text-fg-muted">Pick a new name for this strategy account.</DialogDescription>
                </DialogHeader>
                <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void onConfirm(); }}>
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        maxLength={40}
                        autoComplete="off"
                        autoFocus
                        className="w-full rounded-lg px-3 py-2 text-sm text-fg outline-none field-focus"
                        style={{backgroundColor: 'var(--surface-0)', border: '1px solid color-mix(in srgb, var(--line-strong) 40%, transparent)', fontFamily: 'var(--type-mono)'}}
                    />
                    <button
                        type="submit"
                        disabled={submitting || !valid}
                        className="w-full py-3 rounded-lg text-sm font-bold uppercase tracking-wider transition-all active:scale-[0.98] disabled:opacity-50 text-on-brand"
                        style={{fontFamily: 'var(--type-mono)', backgroundColor: 'var(--brand-strong)'}}
                    >
                        {submitting ? 'Renaming…' : 'Rename'}
                    </button>
                </form>
            </DialogContent>
        </Dialog>
    );
};

// Delete confirmation — spells out exactly what is destroyed.
const DeleteDialog = ({accountId, accountName, onClose}: {accountId: string; accountName: string; onClose: () => void}) => {
    const router = useRouter();
    const [submitting, setSubmitting] = useState(false);

    const onConfirm = async () => {
        if (submitting) return;
        setSubmitting(true);
        try {
            const result = await deletePaperAccount(accountId);
            if (result.success) {
                toast.success(result.message || 'Strategy deleted');
                onClose();
                router.refresh();
            } else {
                toast.error(result.message || 'Delete failed');
            }
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open onOpenChange={(open) => { if (!open && !submitting) onClose(); }}>
            <DialogContent className="bg-surface-1 ring-line sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle className="text-sm font-bold uppercase tracking-[0.1em] text-negative" style={{fontFamily: 'var(--type-mono)'}}>
                        Delete “{accountName}”?
                    </DialogTitle>
                    <DialogDescription className="text-fg-muted">
                        This permanently removes the account, its positions, its trade history and its performance record. This cannot be undone.
                    </DialogDescription>
                </DialogHeader>
                <button
                    type="button"
                    onClick={() => void onConfirm()}
                    disabled={submitting}
                    className="w-full py-3 rounded-lg text-sm font-bold uppercase tracking-wider transition-all active:scale-[0.98] disabled:opacity-50 text-on-negative"
                    style={{fontFamily: 'var(--type-mono)', backgroundColor: 'var(--negative)'}}
                >
                    {submitting ? 'Deleting…' : 'Delete Strategy'}
                </button>
            </DialogContent>
        </Dialog>
    );
};

// Kebab menu next to the account switcher on /portfolio: rename or delete the
// active strategy account. Deleting is blocked server-side for the last account.
const ManageAccountMenu = ({accountId, accountName, canDelete}: {accountId: string; accountName: string; canDelete: boolean}) => {
    const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null);

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        aria-label="Manage strategy account"
                        className="px-2 py-2 rounded-lg text-fg-muted hover:text-fg transition-colors"
                        style={{border: '1px solid color-mix(in srgb, var(--line-strong) 40%, transparent)'}}
                    >
                        <span className="material-symbols-outlined text-base">more_vert</span>
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-surface-1 border-line-strong/50">
                    <DropdownMenuItem onSelect={() => setDialog('rename')} className="cursor-pointer text-fg focus:bg-brand-strong/6">
                        <span className="text-sm" style={{fontFamily: 'var(--type-mono)'}}>Rename</span>
                    </DropdownMenuItem>
                    {canDelete && (
                        <DropdownMenuItem onSelect={() => setDialog('delete')} className="cursor-pointer text-negative focus:bg-negative/8">
                            <span className="text-sm" style={{fontFamily: 'var(--type-mono)'}}>Delete</span>
                        </DropdownMenuItem>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>

            {dialog === 'rename' && <RenameDialog accountId={accountId} currentName={accountName} onClose={() => setDialog(null)} />}
            {dialog === 'delete' && <DeleteDialog accountId={accountId} accountName={accountName} onClose={() => setDialog(null)} />}
        </>
    );
};

export default ManageAccountMenu;
