'use client';

import {useState, useTransition} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {followStrategy, unfollowStrategy} from "@/lib/actions/strategies.actions";

// The optimistic follow toggle behind the detail page's FollowButton and the leaderboard's
// FollowStar: `on` flips at once and reverts, with a toast, if the action fails. A toggle
// that lands calls `onToggled` with the new state, then refreshes the page.
const useFollowStrategy = (slug: string, followed: boolean, onToggled?: (on: boolean) => void) => {
    const router = useRouter();
    const [on, setOn] = useState(followed);
    const [pending, startTransition] = useTransition();

    const toggle = () => {
        const next = !on;
        setOn(next);
        startTransition(async () => {
            const result = next ? await followStrategy(slug) : await unfollowStrategy(slug);
            if (!result.success) {
                setOn(!next);
                toast.error(result.message || 'Could not update your follows');
                return;
            }
            onToggled?.(next);
            router.refresh();
        });
    };

    return {on, pending, toggle};
};

export default useFollowStrategy;
