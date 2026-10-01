'use client';

import {useState} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {formatTimeAgoMs} from "@/lib/format";
import {removeFriend} from "@/lib/actions/friends.actions";
import type {SentFriendRequest} from '@/lib/friends/types';
import Panel from '@/components/primitives/Panel';
import RowCard from "@/components/primitives/RowCard";
import ActionButton from "@/components/primitives/ActionButton";

// After sending a request the user had no view of it at all: a toast, and then nothing.
// Did it reach the right person? Were they ignoring it? Was the address a typo? And since
// sendFriendRequest refuses when any row exists, a request to a wrong address blocked the
// right one permanently with no way to withdraw it.
const SentRequests = ({requests}: {requests: SentFriendRequest[]}) => {
    const router = useRouter();
    const [busyId, setBusyId] = useState<string | null>(null);

    if (requests.length === 0) return null;

    // removeFriend already accepts any friendship where you are requester or addressee,
    // so cancelling is the same call as unfriending.
    const cancel = async (friendshipId: string, name: string) => {
        if (busyId) return;
        setBusyId(friendshipId);
        try {
            const result = await removeFriend(friendshipId);
            if (result.success) {
                toast.success(`Request to ${name} withdrawn`);
                router.refresh();
            } else {
                toast.error(result.message || 'Could not withdraw the request');
            }
        } catch {
            toast.error('Could not reach the server — check your connection and try again');
        } finally {
            setBusyId(null);
        }
    };

    return (
        <Panel as="div">
            <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-brand mb-3 font-mono">
                Sent ({requests.length})
            </h2>
            <div className="space-y-2">
                {requests.map((r) => (
                    <RowCard key={r.friendshipId} className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <div className="text-sm font-semibold text-fg truncate">{r.name}</div>
                            <div className="text-[11px] text-fg-muted truncate">{r.email}</div>
                            <div className="text-[10px] text-fg-muted font-mono">
                                Waiting · sent {formatTimeAgoMs(r.createdAt)}
                            </div>
                        </div>
                        <ActionButton variant="danger" size="xs" className="shrink-0 rounded tracking-wider"
                                      onClick={() => cancel(r.friendshipId, r.name)} disabled={busyId === r.friendshipId}>
                            {busyId === r.friendshipId ? 'Withdrawing…' : 'Withdraw'}
                        </ActionButton>
                    </RowCard>
                ))}
            </div>
        </Panel>
    );
};

export default SentRequests;
