'use client';

import {toast} from "sonner";
import {cn} from "@/lib/utils";
import useFollowStrategy from "@/components/strategies/useFollowStrategy";

// The detail page's follow control. Following pins the strategy at the top of the
// Quant Strategies dashboard widget; it never changes what the strategy does.
const FollowButton = ({slug, followed}: {slug: string; followed: boolean}) => {
    const {on, pending, toggle} = useFollowStrategy(slug, followed, (next) => {
        toast.success(next ? 'Following — pinned on your dashboard widget' : 'Unfollowed');
    });

    return (
        <button
            type="button"
            id="strategy-follow"
            onClick={toggle}
            disabled={pending}
            aria-pressed={on}
            className={cn(
                'control-type inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors disabled:opacity-60',
                on ? 'bg-brand/10 text-brand border-brand/30' : 'bg-surface-2/40 text-fg-soft border-line-strong/30 hover:text-fg hover:border-brand/30',
            )}
        >
            <span className="material-symbols-outlined text-[16px] leading-none" aria-hidden="true" style={on ? {fontVariationSettings: "'FILL' 1"} : undefined}>star</span>
            {on ? 'Following' : 'Follow'}
        </button>
    );
};

export default FollowButton;
