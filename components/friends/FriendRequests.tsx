'use client';

import {useState} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {respondToFriendRequest} from "@/lib/actions/friends.actions";

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
            <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-[#d1bcff] mb-3" style={{fontFamily: 'var(--font-jetbrains)'}}>
                Pending Requests ({requests.length})
            </h2>
            <div className="space-y-2">
                {requests.map((r) => (
                    <div key={r.friendshipId}
                         className="flex items-center justify-between px-4 py-3 rounded-lg border bg-[rgba(30,32,36,0.4)] border-[rgba(59,73,75,0.2)]">
                        <div>
                            <div className="text-sm font-semibold text-[#e2e2e8]">{r.name}</div>
                            <div className="text-[11px] text-[#849495]">{r.email}</div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => respond(r.friendshipId, true)}
                                disabled={busyId === r.friendshipId}
                                className="px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider text-[#002022] disabled:opacity-50"
                                style={{backgroundColor: '#00f0ff', fontFamily: 'var(--font-jetbrains)'}}
                            >
                                Accept
                            </button>
                            <button
                                type="button"
                                onClick={() => respond(r.friendshipId, false)}
                                disabled={busyId === r.friendshipId}
                                className="px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider text-[#b9cacb] hover:text-[#ffb4ab] disabled:opacity-50"
                                style={{border: '1px solid rgba(59,73,75,0.4)', fontFamily: 'var(--font-jetbrains)'}}
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
