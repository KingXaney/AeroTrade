'use client';

import {useState, useTransition} from "react";
import {Star, Trash2} from "lucide-react";
import {toast} from "sonner";
import {cn} from "@/lib/utils";
import {addToWatchlist, removeFromWatchlist} from "@/lib/actions/watchlist.actions";

const WatchlistButton = ({
    symbol,
    company,
    isInWatchlist,
    showTrashIcon = false,
    type = 'icon',
    onWatchlistChange,
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
            onWatchlistChange?.(symbol, next);
        });
    };

    if (type === 'button') {
        return (
            <button
                type="button"
                onClick={toggle}
                disabled={isPending}
                className={cn(
                    'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all',
                    optimistic
                        ? 'text-[#7df4ff] hover:bg-[rgba(125,244,255,0.15)]'
                        : 'text-[#e2e2e8] hover:bg-[rgba(40,42,46,0.8)]',
                    isPending && 'opacity-60 cursor-not-allowed',
                )}
                style={{
                    backgroundColor: optimistic ? 'rgba(125, 244, 255, 0.1)' : '#282a2e',
                    fontFamily: 'var(--font-jetbrains)',
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
                    ? 'text-[#b9cacb] hover:text-[#ffb4ab] hover:bg-[rgba(255,180,171,0.1)]'
                    : optimistic
                    ? 'text-[#7df4ff] hover:text-[#00dbe9]'
                    : 'text-[#849495] hover:text-[#b9cacb]',
                isPending && 'opacity-60 cursor-not-allowed',
            )}
        >
            <Icon className={cn('size-4', optimistic && !showTrashIcon && 'fill-current')} />
        </button>
    );
};

export default WatchlistButton;
