'use client';

import {cn} from "@/lib/utils";
import useFollowStrategy from "@/components/strategies/useFollowStrategy";

// Follow toggle for a leaderboard row. Sits beside the row's stretched link (never inside
// it) so it is valid interactive content with its own accessible name. Optimistic: the
// star flips at once and reverts if the action fails.
const FollowStar = ({slug, name, followed, className}: {slug: string; name: string; followed: boolean; className?: string}) => {
    const {on, pending, toggle} = useFollowStrategy(slug, followed);

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
