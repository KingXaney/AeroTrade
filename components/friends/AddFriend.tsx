'use client';

import {useState} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {sendFriendRequest} from "@/lib/actions/friends.actions";
import Panel from "@/components/primitives/Panel";
import ActionButton from "@/components/primitives/ActionButton";
import TextField from "@/components/primitives/TextField";
import SectionHeading from "@/components/primitives/SectionHeading";

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
        <Panel as="form" onSubmit={onSubmit}>
            <SectionHeading spacing="sm">
                Add a Friend
            </SectionHeading>
            <div className="flex flex-col sm:flex-row gap-2">
                <TextField
                    type="email"
                    font="body"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="friend@email.com"
                    className="flex-1"
                />
                <ActionButton
                    type="submit"
                    variant="strong"
                    glow
                    disabled={busy || !email.trim()}
                    className="px-5 text-sm"
                >
                    {busy ? 'Sending…' : 'Send Request'}
                </ActionButton>
            </div>
            <p className="text-[11px] text-fg-muted mt-2">They must accept before either of you can see the other&apos;s portfolio.</p>
        </Panel>
    );
};

export default AddFriend;
