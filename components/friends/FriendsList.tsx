'use client';

import {useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {removeFriend} from "@/lib/actions/friends.actions";

const FriendsList = ({friends}: {friends: FriendSummary[]}) => {
    const router = useRouter();
    const [busyId, setBusyId] = useState<string | null>(null);

    const onRemove = async (friendshipId: string) => {
        if (busyId) return;
        setBusyId(friendshipId);
        try {
            const result = await removeFriend(friendshipId);
            if (result.success) {
                toast.success(result.message || 'Removed');
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
            <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-[#7df4ff] mb-3" style={{fontFamily: 'var(--font-jetbrains)'}}>
                Your Friends ({friends.length})
            </h2>
            {friends.length === 0 ? (
                <p className="text-sm text-[#849495]">No friends yet — add someone by email to compete.</p>
            ) : (
                <div className="space-y-2">
                    {friends.map((f) => (
                        <div key={f.friendshipId}
                             className="flex items-center justify-between px-4 py-2.5 rounded-lg border bg-[rgba(30,32,36,0.4)] border-[rgba(59,73,75,0.2)]">
                            <Link href={`/friends/${f.id}`} className="group flex items-center gap-3 min-w-0">
                                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                                     style={{backgroundColor: '#00f0ff', color: '#002022', fontFamily: 'var(--font-sora)'}}>
                                    {f.name?.[0]?.toUpperCase() ?? '?'}
                                </div>
                                <div className="min-w-0">
                                    <div className="text-sm font-semibold text-[#e2e2e8] group-hover:text-[#7df4ff] transition-colors truncate">{f.name}</div>
                                    <div className="text-[11px] text-[#849495] truncate">{f.email}</div>
                                </div>
                            </Link>
                            <button
                                type="button"
                                onClick={() => onRemove(f.friendshipId)}
                                disabled={busyId === f.friendshipId}
                                title="Remove friend"
                                className="p-1.5 rounded text-[#849495] hover:text-[#ffb4ab] transition-colors disabled:opacity-50"
                            >
                                <span className="material-symbols-outlined text-base">person_remove</span>
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default FriendsList;
