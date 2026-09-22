'use client';

import {useState, useTransition} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {followStrategy, unfollowStrategy} from "@/lib/actions/strategies.actions";
import {cn} from "@/lib/utils";

// Follow toggle for a leaderboard row. Sits beside the row's stretched link (never inside
// it) so it is valid interactive content with its own accessible name. Optimistic: the
// star flips at once and reverts if the action fails.
const FollowStar = ({slug, name, followed, className}: {slug: string; name: string; followed: boolean; className?: string}) => {
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
            router.refresh();
        });
    };

    return (
        <button
            type="button"
            onClick={toggle}
            disabled={pending}
            aria-pressed={on}
            aria-label={on ? `Unfollow ${name}` : `Follow ${name}`}
            data-testid={`follow-star-${slug}`}
            className={cn('material-symbols-outlined text-[18px] leading-none transition-colors disabled:opacity-60',
                on ? 'text-brand' : 'text-fg-muted hover:text-fg', className)}
            style={on ? {fontVariationSettings: "'FILL' 1"} : undefined}
        >
            <span aria-hidden="true">star</span>
        </button>
    );
};

export default FollowStar;
