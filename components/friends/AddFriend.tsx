'use client';

import {useState} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {sendFriendRequest} from "@/lib/actions/friends.actions";

const AddFriend = () => {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [busy, setBusy] = useState(false);

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const value = email.trim();
        if (!value || busy) return;
        setBusy(true);
        try {
            const result = await sendFriendRequest(value);
            if (result.success) {
                toast.success(result.message || 'Request sent');
                setEmail('');
                router.refresh();
            } else {
                toast.error(result.message || 'Could not send request');
            }
        } finally {
            setBusy(false);
        }
    };

    return (
        <form onSubmit={onSubmit} className="glass-panel rounded-xl p-5">
            <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-brand mb-3" style={{fontFamily: 'var(--type-mono)'}}>
                Add a Friend
            </h2>
            <div className="flex flex-col sm:flex-row gap-2">
                <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="friend@email.com"
                    className="flex-1 rounded-lg px-3 py-2 text-sm text-fg outline-none field-focus"
                    style={{backgroundColor: 'var(--surface-0)', border: '1px solid color-mix(in srgb, var(--line-strong) 40%, transparent)', fontFamily: 'var(--type-body)'}}
                />
                <button
                    type="submit"
                    disabled={busy || !email.trim()}
                    className="px-5 py-2 rounded-lg text-sm font-bold uppercase tracking-wider text-on-brand transition-all active:scale-[0.98] disabled:opacity-50"
                    style={{backgroundColor: 'var(--brand-strong)', boxShadow: '0 0 15px color-mix(in srgb, var(--brand-strong) 30%, transparent)', fontFamily: 'var(--type-mono)'}}
                >
                    {busy ? 'Sending…' : 'Send Request'}
                </button>
            </div>
            <p className="text-[11px] text-fg-muted mt-2">They must accept before either of you can see the other&apos;s portfolio.</p>
        </form>
    );
};

export default AddFriend;
