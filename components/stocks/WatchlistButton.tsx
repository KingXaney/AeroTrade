'use client';

import {useState, useTransition} from "react";
import {Star, Trash2} from "lucide-react";
import {toast} from "sonner";
import {cn} from "@/lib/utils";
import {addToWatchlist, removeFromWatchlist} from "@/lib/actions/watchlist.actions";

type WatchlistButtonProps = {
    symbol: string;
    company: string;
    isInWatchlist: boolean;
    showTrashIcon?: boolean;
    type?: 'button' | 'icon';
};

const WatchlistButton = ({
    symbol,
    company,
    isInWatchlist,
    showTrashIcon = false,
    type = 'icon',
}: WatchlistButtonProps) => {
    const [optimistic, setOptimistic] = useState(isInWatchlist);
    const [isPending, startTransition] = useTransition();

    const toggle = (e?: React.MouseEvent | React.KeyboardEvent) => {
        // When this lives inside a clickable row (table / search result) we must not bubble.
        e?.preventDefault();
        e?.stopPropagation();

        const next = !optimistic;
        setOptimistic(next);

        startTransition(async () => {
            const result = next
                ? await addToWatchlist({symbol, company})
                : await removeFromWatchlist(symbol);

            if (!result.success) {
                setOptimistic(!next); // rollback
                toast.error(result.message || 'Watchlist update failed');
                return;
            }

            toast.success(next ? `${symbol} added to watchlist` : `${symbol} removed from watchlist`);
        });
    };

    if (type === 'button') {
        return (
            <button
                type="button"
                onClick={toggle}
                disabled={isPending}
                className={cn(
                    'font-mono inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all',
                    optimistic
                        ? 'text-brand hover:bg-brand/15'
                        : 'text-fg hover:bg-surface-3/80',
                    isPending && 'opacity-60 cursor-not-allowed',
                )}
                style={{
                    backgroundColor: optimistic ? 'color-mix(in srgb, var(--brand) 10%, transparent)' : 'var(--surface-3)',
                    letterSpacing: '0.02em',
                }}
                aria-pressed={optimistic}
            >
                <Star className={cn('size-4', optimistic && 'fill-current')} />
                {optimistic ? 'In Watchlist' : 'Add to Watchlist'}
            </button>
        );
    }

    const Icon = showTrashIcon && optimistic ? Trash2 : Star;
    return (
        <button
            type="button"
            onClick={toggle}
            disabled={isPending}
            aria-pressed={optimistic}
            aria-label={optimistic ? `Remove ${symbol} from watchlist` : `Add ${symbol} to watchlist`}
            className={cn(
                'inline-flex size-8 items-center justify-center rounded-md transition-colors',
                showTrashIcon && optimistic
                    ? 'text-fg-soft hover:text-negative hover:bg-negative/10'
                    : optimistic
                    ? 'text-brand hover:text-brand-dim'
                    : 'text-fg-muted hover:text-fg-soft',
                isPending && 'opacity-60 cursor-not-allowed',
            )}
        >
            <Icon className={cn('size-4', optimistic && !showTrashIcon && 'fill-current')} />
        </button>
    );
};

export default WatchlistButton;
