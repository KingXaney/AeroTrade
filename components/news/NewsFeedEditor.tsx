'use client';

import {useState, useTransition} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {Loader2} from "lucide-react";
import Switch from "@/components/primitives/Switch";
import KeywordChips from "@/components/forms/KeywordChips";
import useResetNewsFeed from "@/components/news/useResetNewsFeed";
import {saveNewsFeed} from "@/lib/actions/news-feed.actions";
import {
    describeNewsFeed,
    MAX_FEED_CATEGORIES,
    MAX_FEED_KEYWORDS,
    MAX_FEED_OUTLETS,
    MAX_FEED_REGIONS,
    NEWS_CATEGORIES,
    NEWS_REGIONS,
    newsFeedEqual,
    normalizeNewsFeed,
    OUTLET_MAX_CHARS,
    outletKey,
    planFeedSlots,
    SUGGESTED_OUTLETS,
    type NewsCategoryId,
    type NewsFeedPrefs,
    type NewsRegionId,
} from "@/lib/news/feed-prefs";
import {KEYWORD_MAX} from "@/lib/news/keywords";
import {cn} from "@/lib/utils";
import {NEWS_COPY} from "@/lib/learn/copy/news";
import {UNREACHABLE_MESSAGE} from "@/lib/action-toast";
import RowCard from "@/components/primitives/RowCard";
import ActionButton from "@/components/primitives/ActionButton";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from "@/components/ui/dialog";

// Imports lib/news/feed-prefs, never lib/news/feed: the latter reaches the XML parser
// through the search adapter and has no business in the client bundle.

const chipClass = (on: boolean) => cn(
    'rounded-full border px-3 py-1.5 font-mono text-xs transition-colors',
    on ? 'border-brand bg-brand/10 text-brand' : 'border-line-strong/30 bg-surface-2/40 text-fg-soft hover:text-fg hover:border-brand/40',
);

const Group = ({label, hint, children}: {label: string; hint?: string; children: React.ReactNode}) => (
    <div>
        <div className="label-type text-[length:var(--label-size)] text-fg-muted mb-2">{label}</div>
        {children}
        {hint && <p className="mt-1.5 text-[11px] text-fg-muted">{hint}</p>}
    </div>
);

type Props = {initial: NewsFeedPrefs; startOpen?: boolean};

// The title action opens a focused editor. The draft is normalised on every
// render so the summary line, the fetch-budget hint and the Save button all describe what
// will actually be stored, not what was typed.
const NewsFeedEditor = ({initial, startOpen = false}: Props) => {
    const router = useRouter();
    const [open, setOpen] = useState(startOpen);
    const [draft, setDraft] = useState<NewsFeedPrefs>(initial);
    const [saved, setSaved] = useState<NewsFeedPrefs>(initial);
    const [pending, startTransition] = useTransition();

    const normalized = normalizeNewsFeed(draft);
    const dirty = !newsFeedEqual(normalized, saved);
    const {slots, dropped} = planFeedSlots(normalized);

    const toggleCategory = (id: NewsCategoryId) => {
        const on = draft.categories.includes(id);
        if (!on && draft.categories.length >= MAX_FEED_CATEGORIES) { toast.error(`Up to ${MAX_FEED_CATEGORIES} categories`); return; }
        setDraft({...draft, categories: on ? draft.categories.filter((c) => c !== id) : [...draft.categories, id]});
    };
    const toggleRegion = (id: NewsRegionId) => {
        const on = draft.regions.includes(id);
        if (!on && draft.regions.length >= MAX_FEED_REGIONS) { toast.error(`Up to ${MAX_FEED_REGIONS} regions`); return; }
        setDraft({...draft, regions: on ? draft.regions.filter((r) => r !== id) : [...draft.regions, id]});
    };
    const hasOutlet = (name: string) => draft.includeSources.some((o) => outletKey(o) === outletKey(name));
    const toggleSuggested = (name: string) => {
        if (hasOutlet(name)) { setDraft({...draft, includeSources: draft.includeSources.filter((o) => outletKey(o) !== outletKey(name))}); return; }
        if (draft.includeSources.length >= MAX_FEED_OUTLETS) { toast.error(`Up to ${MAX_FEED_OUTLETS} outlets`); return; }
        setDraft({...draft, includeSources: [...draft.includeSources, name]});
    };

    const save = () => startTransition(async () => {
        try {
            const result = await saveNewsFeed(normalized);
            if (!result.success || !result.feed) {
                toast.error(result.message ?? 'Could not save your news feed');
                return;
            }
            setSaved(result.feed);
            setDraft(result.feed);
            toast.success('News feed saved');
            router.refresh();
        } catch {
            toast.error(UNREACHABLE_MESSAGE);
        }
    });

    const {askReset, resetDialog} = useResetNewsFeed((feed) => {
        setSaved(feed);
        setDraft(feed);
    });

    const toggle = (
        <ActionButton id="news-feed-edit" variant="secondary" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? NEWS_COPY.closeEditor : NEWS_COPY.customize}
        </ActionButton>
    );

    return (
        <>
            {toggle}
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
                    <DialogHeader>
                        <DialogTitle className="font-heading">{NEWS_COPY.customize}</DialogTitle>
                        <DialogDescription>{NEWS_COPY.editorDescription}</DialogDescription>
                    </DialogHeader>
                    <fieldset disabled={pending} className="min-w-0 space-y-5 border-0 p-0">
                        <p className="text-xs text-fg-muted">{describeNewsFeed(normalized)}{dirty ? ' · unsaved' : ''}</p>
                        <Group label="Categories" hint={`Up to ${MAX_FEED_CATEGORIES}. Top stories is Google's front page; Markets is the CNBC, MarketWatch and Yahoo Finance wires.`}>
                            <div className="flex flex-wrap gap-2" role="group" aria-label="Categories">
                                {NEWS_CATEGORIES.map((c) => (
                                    <button key={c.id} id={`news-cat-${c.id}`} type="button" aria-pressed={draft.categories.includes(c.id)}
                                            title={c.hint} onClick={() => toggleCategory(c.id)} className={chipClass(draft.categories.includes(c.id))}>
                                        {c.label}
                                    </button>
                                ))}
                            </div>
                        </Group>

                        <Group label="Regions" hint={`Google News editions, up to ${MAX_FEED_REGIONS}. Each category is fetched for each region.`}>
                            <div className="flex flex-wrap gap-2" role="group" aria-label="Regions">
                                {NEWS_REGIONS.map((r) => (
                                    <button key={r.id} id={`news-region-${r.id}`} type="button" aria-pressed={draft.regions.includes(r.id)}
                                            onClick={() => toggleRegion(r.id)} className={chipClass(draft.regions.includes(r.id))}>
                                        {r.label}
                                    </button>
                                ))}
                            </div>
                        </Group>

                        <Group label="Preferred outlets" hint="Only these outlets are shown when the list is not empty — it narrows every feed. Use Hide for a lighter touch.">
                            <div className="mb-2 flex flex-wrap gap-2" role="group" aria-label="Suggested outlets">
                                {SUGGESTED_OUTLETS.map((name) => (
                                    <button key={name} type="button" aria-pressed={hasOutlet(name)} onClick={() => toggleSuggested(name)} className={chipClass(hasOutlet(name))}>
                                        {name}
                                    </button>
                                ))}
                            </div>
                            <KeywordChips values={draft.includeSources} editable variant="include" max={MAX_FEED_OUTLETS} maxLength={OUTLET_MAX_CHARS}
                                          placeholder="Add an outlet…" ariaLabel="Preferred outlets"
                                          onChange={(next) => setDraft({...draft, includeSources: next})} />
                        </Group>

                        <Group label="Hide outlets" hint="Never show these, whatever else the feed carries.">
                            <KeywordChips values={draft.excludeSources} editable variant="exclude" max={MAX_FEED_OUTLETS} maxLength={OUTLET_MAX_CHARS}
                                          placeholder="Hide an outlet…" ariaLabel="Hidden outlets"
                                          onChange={(next) => setDraft({...draft, excludeSources: next})} />
                        </Group>

                        <Group label="Keywords" hint={`Up to ${MAX_FEED_KEYWORDS} terms, fetched as one Google News search alongside your categories.`}>
                            <KeywordChips values={draft.keywords} editable max={MAX_FEED_KEYWORDS} maxLength={KEYWORD_MAX}
                                          placeholder="Add a keyword…" ariaLabel="Keywords"
                                          onChange={(next) => setDraft({...draft, keywords: next})} />
                        </Group>

                        <RowCard as="label" htmlFor="news-watchlist-toggle" className="flex cursor-pointer items-center justify-between gap-4">
                            <div>
                                <div className="text-sm font-medium text-fg">Include my watchlist companies</div>
                                <div className="text-[11px] text-fg-muted">Company headlines for the symbols you watch, mixed into the feed.</div>
                            </div>
                            <Switch id="news-watchlist-toggle" checked={draft.includeWatchlist}
                                    onCheckedChange={(checked) => setDraft({...draft, includeWatchlist: checked})} />
                        </RowCard>

                        {dropped > 0 && (
                            <p role="status" className="text-[11px] text-warning font-mono">
                                {slots.length} of {slots.length + dropped} feeds will be fetched — remove a region or category to cover everything.
                            </p>
                        )}

                        <div className="flex items-center justify-between gap-2 border-t border-line-strong/20 pt-3 font-mono">
                            <button id="news-feed-reset" type="button" onClick={askReset}
                                    className="label-type text-xs text-fg-muted transition-colors hover:text-negative">
                                Reset to top stories
                            </button>
                            <ActionButton id="news-feed-save" size="md" className="inline-flex items-center gap-2" onClick={save} disabled={!dirty}>
                                {pending && <Loader2 className="size-3.5 animate-spin" />}
                                Save feed
                            </ActionButton>
                        </div>
                    </fieldset>
                </DialogContent>
            </Dialog>
            {resetDialog}
        </>
    );
};

export default NewsFeedEditor;
