'use client';

import {cn} from "@/lib/utils";
import type {TopicOffer} from "@/lib/topics/manage";

type Props = {
    items: readonly TopicOffer[];
    selected: ReadonlySet<string>;      // offer slugs
    onToggle: (slug: string) => void;
    disabled?: boolean;
    label: string;
};

// One group of starter chips, keyed by slug: the empty state's picker and the manage view's "Add
// topics" panel draw the same control. A chip carries its own on/off state, so it is not an
// ActionButton (components/primitives/ActionButton.tsx); QA locates one by data-topic-chip.
const TopicChips = ({items, selected, onToggle, disabled = false, label}: Props) => (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
        {items.map((offer) => {
            const on = selected.has(offer.slug);
            return (
                <button key={offer.slug} type="button" aria-pressed={on} disabled={disabled} data-topic-chip={offer.slug}
                        onClick={() => onToggle(offer.slug)}
                        className={cn('font-mono rounded-full border px-3 py-1.5 text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                            on ? 'border-brand bg-brand/10 text-brand' : 'border-line-strong/30 bg-surface-2/40 text-fg-soft hover:text-fg hover:border-brand/40')}>
                    {on ? '✓ ' : ''}{offer.name}
                </button>
            );
        })}
    </div>
);

export default TopicChips;
