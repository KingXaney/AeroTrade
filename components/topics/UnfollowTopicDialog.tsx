'use client';

import ConfirmDialog from "@/components/primitives/ConfirmDialog";

// The one "Stop following" confirmation, for the topic page's header menu and every
// FollowTopicButton. The caller owns what unfollowing does (the button flips optimistically,
// the header leaves the page), so it passes `onConfirm`.
type Props = {
    name: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => Promise<void> | void;
};

const UnfollowTopicDialog = ({name, open, onOpenChange, onConfirm}: Props) => (
    <ConfirmDialog
        open={open}
        onOpenChange={onOpenChange}
        title={`Stop following “${name}”?`}
        description="Its matched articles are removed. This cannot be undone."
        confirmLabel="Stop following"
        destructive
        onConfirm={onConfirm}
    />
);

export default UnfollowTopicDialog;
