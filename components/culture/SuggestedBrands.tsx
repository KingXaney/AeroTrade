import RowCard from "@/components/primitives/RowCard";
import type {SuggestionRow} from "@/lib/culture/store";
import {getEasternDateString} from "@/lib/dates";
import {CULTURE_COPY} from "@/lib/learn/copy/culture";

// Names the model met that the catalog lacks, most mentioned first. A person adds one to
// lib/culture/catalog.ts; nothing here writes anything.
const SuggestedBrands = ({rows}: {rows: SuggestionRow[]}) => (
    <div>
        <p className="text-xs text-fg-muted mb-3">{CULTURE_COPY.suggestionsLead}</p>
        {rows.length === 0 ? (
            <p className="text-sm text-fg-muted">{CULTURE_COPY.suggestionsEmpty}</p>
        ) : (
            <ul className="space-y-1" data-suggested-brands>
                {rows.map((row) => (
                    <RowCard key={row.name} as="li" className="flex items-center justify-between gap-2 px-3 py-2">
                        <span className="text-xs font-semibold text-fg font-mono truncate">{row.name}</span>
                        <span className="text-[11px] text-fg-muted font-mono shrink-0">
                            {CULTURE_COPY.suggestionRow(row.count, getEasternDateString(new Date(row.firstSeenAt)))}
                        </span>
                    </RowCard>
                ))}
            </ul>
        )}
    </div>
);

export default SuggestedBrands;
