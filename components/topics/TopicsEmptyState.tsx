'use client';

import {useState, useTransition} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {Loader2} from "lucide-react";
import TopicComposer from "@/components/topics/TopicComposer";
import Panel from "@/components/primitives/Panel";
import PageTitle from "@/components/primitives/PageTitle";
import MicroLabel from "@/components/primitives/MicroLabel";
import {cn} from "@/lib/utils";
import {followStarterTopics, restoreDefaultTopics} from "@/lib/actions/topics.actions";
import {STARTER_TOPICS, type StarterGroup} from "@/lib/topics/starters";

export type SuggestedTopic = {name: string; keywords: string[]; exclude?: string[]};

const GROUP_LABEL: Record<StarterGroup, string> = {finance: 'Markets & macro', world: 'World news'};
const GROUPS: StarterGroup[] = ['finance', 'world'];

const Chips = ({items, selected, onToggle}: {items: SuggestedTopic[]; selected: Set<string>; onToggle: (name: string) => void}) => (
    <div className="flex flex-wrap gap-2">
        {items.map((s) => {
            const on = selected.has(s.name);
            return (
                <button key={s.name} type="button" aria-pressed={on} onClick={() => onToggle(s.name)}
                        className={cn('font-mono rounded-full border px-3 py-1.5 text-xs transition-colors',
                            on ? 'border-brand bg-brand/10 text-brand' : 'border-line-strong/30 bg-surface-2/40 text-fg-soft hover:text-fg hover:border-brand/40')}>
                    {on ? '✓ ' : ''}{s.name}
                </button>
            );
        })}
    </div>
);

// Reached two ways now. For a new account this is dead code — topics are seeded at
// sign-up — so getting here means the user unfollowed everything on purpose, and
// `canRestoreDefaults` offers the way back. It is no longer a wall in front of the app.
const TopicsEmptyState = ({brainSuggestions, canRestoreDefaults = false}: {brainSuggestions: SuggestedTopic[]; canRestoreDefaults?: boolean}) => {
    const router = useRouter();
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [composerOpen, setComposerOpen] = useState(false);
    const [pending, startTransition] = useTransition();

    const all = [...STARTER_TOPICS, ...brainSuggestions.filter((b) => !STARTER_TOPICS.some((s) => s.name === b.name))];
    const toggle = (name: string) => setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(name)) next.delete(name); else next.add(name);
        return next;
    });

    // Land on the first new topic: its page does a bounded live fetch, so the first thing
    // seen is articles rather than a merged feed waiting on a job. push() alone — a
    // refresh() on top would render that page (and its live fetch) a second time before
    // the first has stamped lastFetchedAt.
    const land = (firstSlug: string | null) => {
        if (firstSlug) router.push(`/topics/${firstSlug}`);
        else router.refresh();
    };

    const followSelected = () => startTransition(async () => {
        const picks = all.filter((s) => selected.has(s.name)).map((s) => ({name: s.name, keywords: s.keywords, exclude: s.exclude ?? []}));
        const result = await followStarterTopics(picks);
        if (result.created > 0) toast.success(result.created === 1 ? 'Following 1 topic' : `Following ${result.created} topics`);
        if (result.message) toast.error(result.message);
        land(result.firstSlug);
    });

    const restoreDefaults = () => startTransition(async () => {
        const result = await restoreDefaultTopics();
        if (result.created > 0) toast.success(`Restored ${result.created} default topics`);
        if (result.message) toast.error(result.message);
        land(result.firstSlug);
    });

    return (
        <div className="space-y-4">
            <PageTitle title="Topics" subtitle="Everything you follow, from every source we read" />
            <Panel pad={8} className="md:p-12">
                <div className="max-w-2xl">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center bg-brand/10 mb-4">
                        <span className="material-symbols-outlined text-brand">interests</span>
                    </div>
                    <h2 className="font-heading text-xl font-semibold text-fg">Follow what you care about</h2>
                    <p className="mt-2 text-sm text-fg-muted">
                        Topics track news from every source we read — markets, macro, world affairs, anything.
                        {canRestoreDefaults ? ' Put the starting set back, or pick your own.' : ' Pick a few to start, or write your own.'}
                    </p>
                </div>

                <div className="mt-6 space-y-5">
                    {GROUPS.map((group) => (
                        <div key={group}>
                            <MicroLabel as="div" className="mb-2">{GROUP_LABEL[group]}</MicroLabel>
                            <Chips items={STARTER_TOPICS.filter((s) => s.group === group)} selected={selected} onToggle={toggle} />
                        </div>
                    ))}
                    {brainSuggestions.length > 0 && (
                        <div>
                            <MicroLabel as="div" className="mb-2">What the News Brain is tracking</MicroLabel>
                            <Chips items={brainSuggestions} selected={selected} onToggle={toggle} />
                        </div>
                    )}
                </div>

                <div className="font-mono mt-6 flex flex-wrap items-center gap-2">
                    <button type="button" onClick={followSelected} disabled={pending || selected.size === 0}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-[0.1em] bg-brand text-on-brand disabled:opacity-50">
                        {pending && <Loader2 className="size-3.5 animate-spin" />}
                        Follow {selected.size > 0 ? `${selected.size} selected` : 'selected'}
                    </button>
                    {canRestoreDefaults && (
                        <button type="button" onClick={restoreDefaults} disabled={pending}
                                className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-[0.1em] text-fg-soft hover:text-fg border border-line-strong/40 disabled:opacity-50">
                            Restore the default topics
                        </button>
                    )}
                    <button type="button" onClick={() => setComposerOpen(true)}
                            className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-[0.1em] text-fg-soft hover:text-fg border border-line-strong/40">
                        Write my own
                    </button>
                </div>
            </Panel>
            <TopicComposer open={composerOpen} onOpenChange={setComposerOpen} mode="create" />
        </div>
    );
};

export default TopicsEmptyState;
