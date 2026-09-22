'use client';

import {useState, useTransition, type MouseEvent} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {followStrategy, unfollowStrategy} from "@/lib/actions/strategies.actions";
import {cn} from "@/lib/utils";

// Follow toggle for a leaderboard row. Lives inside a <Link>, so the click must stop
// there. Optimistic: the star flips at once and reverts if the action fails.
const FollowStar = ({slug, followed}: {slug: string; followed: boolean}) => {
    const router = useRouter();
    const [on, setOn] = useState(followed);
    const [pending, startTransition] = useTransition();

    const toggle = (event: MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();
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
            aria-label={on ? `Unfollow ${slug}` : `Follow ${slug}`}
            data-testid={`follow-star-${slug}`}
            className={cn('material-symbols-outlined text-[18px] leading-none transition-colors disabled:opacity-60',
                on ? 'text-brand' : 'text-fg-muted hover:text-fg')}
            style={on ? {fontVariationSettings: "'FILL' 1"} : undefined}
        >
            star
        </button>
    );
};

export default FollowStar;
