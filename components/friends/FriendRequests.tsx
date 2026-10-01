'use client';

import {useState} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {respondToFriendRequest} from "@/lib/actions/friends.actions";
import type {FriendRequest} from '@/lib/friends/types';
import Panel from '@/components/primitives/Panel';
import RowCard from "@/components/primitives/RowCard";
import ActionButton from "@/components/primitives/ActionButton";

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
        <Panel as="div">
            <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-brand mb-3" style={{fontFamily: 'var(--type-mono)'}}>
                Pending Requests ({requests.length})
            </h2>
            <div className="space-y-2">
                {requests.map((r) => (
                    <RowCard key={r.friendshipId} className="flex items-center justify-between">
                        <div>
                            <div className="text-sm font-semibold text-fg">{r.name}</div>
                            <div className="text-[11px] text-fg-muted">{r.email}</div>
                        </div>
                        <div className="flex items-center gap-2">
                            <ActionButton variant="strong" size="xs" className="rounded"
                                          onClick={() => respond(r.friendshipId, true)} disabled={busyId === r.friendshipId}>
                                Accept
                            </ActionButton>
                            <ActionButton variant="danger" size="xs" className="rounded tracking-wider"
                                          onClick={() => respond(r.friendshipId, false)} disabled={busyId === r.friendshipId}>
                                Decline
                            </ActionButton>
                        </div>
                    </RowCard>
                ))}
            </div>
        </Panel>
    );
};

export default FriendRequests;
