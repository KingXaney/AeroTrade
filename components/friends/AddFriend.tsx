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
            <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-[#7df4ff] mb-3" style={{fontFamily: 'var(--font-jetbrains)'}}>
                Add a Friend
            </h2>
            <div className="flex flex-col sm:flex-row gap-2">
                <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="friend@email.com"
                    className="flex-1 rounded-lg px-3 py-2 text-sm text-[#e2e2e8] outline-none"
                    style={{backgroundColor: '#111318', border: '1px solid rgba(59,73,75,0.4)', fontFamily: 'var(--font-hanken)'}}
                />
                <button
                    type="submit"
                    disabled={busy || !email.trim()}
                    className="px-5 py-2 rounded-lg text-sm font-bold uppercase tracking-wider text-[#002022] transition-all active:scale-[0.98] disabled:opacity-50"
                    style={{backgroundColor: '#00f0ff', boxShadow: '0 0 15px rgba(0,240,255,0.3)', fontFamily: 'var(--font-jetbrains)'}}
                >
                    {busy ? 'Sending…' : 'Send Request'}
                </button>
            </div>
            <p className="text-[11px] text-[#849495] mt-2">They must accept before either of you can see the other&apos;s portfolio.</p>
        </form>
    );
};

export default AddFriend;
