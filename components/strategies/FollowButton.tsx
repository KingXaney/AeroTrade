'use client';

import {useState, useTransition} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {followStrategy, unfollowStrategy} from "@/lib/actions/strategies.actions";
import {cn} from "@/lib/utils";

// The detail page's follow control. Following pins the strategy at the top of the
// Quant Strategies dashboard widget; it never changes what the strategy does.
const FollowButton = ({slug, followed}: {slug: string; followed: boolean}) => {
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
            toast.success(next ? 'Following — pinned on your dashboard widget' : 'Unfollowed');
            router.refresh();
        });
    };

    return (
        <button
            type="button"
            id="strategy-follow"
            onClick={toggle}
            disabled={pending}
            aria-pressed={on}
            className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold uppercase tracking-[0.08em] transition-colors disabled:opacity-60',
                on ? 'bg-brand/10 text-brand border-brand/30' : 'bg-surface-2/40 text-fg-soft border-line-strong/30 hover:text-fg hover:border-brand/30',
            )}
            style={{fontFamily: 'var(--type-mono)'}}
        >
            <span className="material-symbols-outlined text-[16px] leading-none" style={on ? {fontVariationSettings: "'FILL' 1"} : undefined}>star</span>
            {on ? 'Following' : 'Follow'}
        </button>
    );
};

export default FollowButton;
