'use client';

import {useState, useTransition} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {Loader2} from "lucide-react";
import {Switch} from "@/components/ui/switch";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import KeywordChips from "@/components/topics/KeywordChips";
import {resetNewsFeed, saveNewsFeed} from "@/lib/actions/news-feed.actions";
import {
    defaultNewsFeed,
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
import {KEYWORD_MAX} from "@/lib/topics/config";
import {cn} from "@/lib/utils";

// Imports lib/news/feed-prefs, never lib/news/feed: the latter reaches the XML parser
// through the search adapter and has no business in the client bundle.

const mono = {fontFamily: 'var(--type-mono)'} as const;
const switchClass = "data-[state=checked]:!bg-brand-strong data-[state=unchecked]:!bg-surface-4 data-[state=unchecked]:!border data-[state=unchecked]:!border-line-strong transition-colors duration-200";
const chipClass = (on: boolean) => cn(
    'rounded-full border px-3 py-1.5 text-xs transition-colors',
    on ? 'border-brand bg-brand/10 text-brand' : 'border-line-strong/30 bg-surface-2/40 text-fg-soft hover:text-fg hover:border-brand/40',
);
const secondaryButton = "px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-[0.1em] text-fg-soft hover:text-fg border border-line-strong/40 disabled:opacity-50";

const Group = ({label, hint, children}: {label: string; hint?: string; children: React.ReactNode}) => (
    <div>
        <div className="text-[10px] uppercase tracking-[0.14em] text-fg-muted mb-2" style={mono}>{label}</div>
        {children}
        {hint && <p className="mt-1.5 text-[11px] text-fg-muted">{hint}</p>}
    </div>
);

type Props = {initial: NewsFeedPrefs; startOpen?: boolean};

// The whole preference in one panel, saved explicitly. The draft is normalised on every
// render so the summary line, the fetch-budget hint and the Save button all describe what
// will actually be stored, not what was typed.
const NewsFeedEditor = ({initial, startOpen = false}: Props) => {
    const router = useRouter();
    const [open, setOpen] = useState(startOpen);
    const [draft, setDraft] = useState<NewsFeedPrefs>(initial);
    const [saved, setSaved] = useState<NewsFeedPrefs>(initial);
    const [confirmingReset, setConfirmingReset] = useState(false);
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
        const result = await saveNewsFeed(normalized);
        if (!result.success || !result.feed) {
            toast.error(result.message ?? 'Could not save your news feed');
            return;
        }
        setSaved(result.feed);
        setDraft(result.feed);
        toast.success('News feed saved');
        router.refresh();
    });

    const reset = async () => {
        const result = await resetNewsFeed();
        if (!result.success) {
            toast.error(result.message ?? 'Could not reset your news feed');
            return;
        }
        const feed = result.feed ?? defaultNewsFeed();
        setSaved(feed);
        setDraft(feed);
        toast.success('News feed reset to top stories');
        router.refresh();
    };

    return (
        <section className="glass-panel rounded-xl p-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                    <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-brand" style={mono}>Your feed</h2>
                    <p className="text-xs text-fg-muted mt-1" style={mono}>{describeNewsFeed(normalized)}{dirty ? ' · unsaved' : ''}</p>
                </div>
                <button id="news-feed-edit" type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={secondaryButton} style={mono}>
                    {open ? 'Close' : 'Edit feed'}
                </button>
            </div>

            {open && (
                <div className="mt-5 space-y-5">
                    <Group label="Categories" hint={`Up to ${MAX_FEED_CATEGORIES}. Top stories is Google's front page; Markets is the CNBC, MarketWatch and Yahoo Finance wires.`}>
                        <div className="flex flex-wrap gap-2" role="group" aria-label="Categories">
                            {NEWS_CATEGORIES.map((c) => (
                                <button key={c.id} id={`news-cat-${c.id}`} type="button" aria-pressed={draft.categories.includes(c.id)}
                                        title={c.hint} onClick={() => toggleCategory(c.id)} className={chipClass(draft.categories.includes(c.id))} style={mono}>
                                    {c.label}
                                </button>
                            ))}
                        </div>
                    </Group>

                    <Group label="Regions" hint={`Google News editions, up to ${MAX_FEED_REGIONS}. Each category is fetched for each region.`}>
                        <div className="flex flex-wrap gap-2" role="group" aria-label="Regions">
                            {NEWS_REGIONS.map((r) => (
                                <button key={r.id} id={`news-region-${r.id}`} type="button" aria-pressed={draft.regions.includes(r.id)}
                                        onClick={() => toggleRegion(r.id)} className={chipClass(draft.regions.includes(r.id))} style={mono}>
                                    {r.label}
                                </button>
                            ))}
                        </div>
                    </Group>

                    <Group label="Preferred outlets" hint="Only these outlets are shown when the list is not empty — it narrows every feed. Use Hide for a lighter touch.">
                        <div className="flex flex-wrap gap-2 mb-2" role="group" aria-label="Suggested outlets">
                            {SUGGESTED_OUTLETS.map((name) => (
                                <button key={name} type="button" aria-pressed={hasOutlet(name)} onClick={() => toggleSuggested(name)} className={chipClass(hasOutlet(name))} style={mono}>
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

                    <label htmlFor="news-watchlist-toggle" className="flex items-center justify-between gap-4 rounded-lg border border-line-strong/20 bg-surface-2/40 px-4 py-3 cursor-pointer">
                        <div>
                            <div className="text-sm font-medium text-fg">Include my watchlist companies</div>
                            <div className="text-[11px] text-fg-muted">Company headlines for the symbols you watch, mixed into the feed.</div>
                        </div>
                        <Switch id="news-watchlist-toggle" checked={draft.includeWatchlist}
                                onCheckedChange={(checked) => setDraft({...draft, includeWatchlist: checked})} className={switchClass} />
                    </label>

                    {dropped > 0 && (
                        <p role="status" className="text-[11px] text-warning" style={mono}>
                            {slots.length} of {slots.length + dropped} feeds will be fetched — remove a region or category to cover everything.
                        </p>
                    )}

                    <div className="flex items-center justify-between gap-2 pt-3 border-t border-line-strong/20" style={mono}>
                        <button id="news-feed-reset" type="button" onClick={() => setConfirmingReset(true)}
                                className="text-xs uppercase tracking-[0.1em] text-fg-muted hover:text-negative transition-colors">
                            Reset to top stories
                        </button>
                        <button id="news-feed-save" type="button" onClick={save} disabled={pending || !dirty}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-[0.1em] bg-brand text-on-brand disabled:opacity-50">
                            {pending && <Loader2 className="size-3.5 animate-spin" />}
                            Save feed
                        </button>
                    </div>
                </div>
            )}

            <ConfirmDialog
                open={confirmingReset}
                onOpenChange={setConfirmingReset}
                title="Reset your news feed?"
                description="Back to Google News top stories for the United States. Your categories, regions, outlets and keywords are cleared."
                confirmLabel="Reset feed"
                destructive
                onConfirm={reset}
            />
        </section>
    );
};

export default NewsFeedEditor;
