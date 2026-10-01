'use client';

import {useState} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {respondToFriendRequest} from "@/lib/actions/friends.actions";
import type {FriendRequest} from '@/lib/friends/types';

const FriendRequests = ({requests}: {requests: FriendRequest[]}) => {
    const router = useRouter();
    const [busyId, setBusyId] = useState<string | null>(null);

    if (requests.length === 0) return null;

    const respond = async (friendshipId: string, accept: boolean) => {
        if (busyId) return;
        setBusyId(friendshipId);
        try {
            const result = await respondToFriendRequest(friendshipId, accept);
            if (result.success) {
                toast.success(result.message || 'Done');
                router.refresh();
            } else {
                toast.error(result.message || 'Failed');
            }
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div className="glass-panel rounded-xl p-5">
            <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-brand mb-3" style={{fontFamily: 'var(--type-mono)'}}>
                Pending Requests ({requests.length})
            </h2>
            <div className="space-y-2">
                {requests.map((r) => (
                    <div key={r.friendshipId}
                         className="flex items-center justify-between px-4 py-3 rounded-lg border bg-surface-2/40 border-line-strong/20">
                        <div>
                            <div className="text-sm font-semibold text-fg">{r.name}</div>
                            <div className="text-[11px] text-fg-muted">{r.email}</div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => respond(r.friendshipId, true)}
                                disabled={busyId === r.friendshipId}
                                className="px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider text-on-brand disabled:opacity-50"
                                style={{backgroundColor: 'var(--brand-strong)', fontFamily: 'var(--type-mono)'}}
                            >
                                Accept
                            </button>
                            <button
                                type="button"
                                onClick={() => respond(r.friendshipId, false)}
                                disabled={busyId === r.friendshipId}
                                className="px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider text-fg-soft hover:text-negative disabled:opacity-50"
                                style={{border: '1px solid color-mix(in srgb, var(--line-strong) 40%, transparent)', fontFamily: 'var(--type-mono)'}}
                            >
                                Decline
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default FriendRequests;
