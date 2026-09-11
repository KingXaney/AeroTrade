'use client';

import {useState, useTransition} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {Loader2} from "lucide-react";
import TopicComposer from "@/components/topics/TopicComposer";
import {cn} from "@/lib/utils";
import {createTopic} from "@/lib/actions/topics.actions";
import {STARTER_TOPICS} from "@/lib/topics/starters";

export type SuggestedTopic = {name: string; keywords: string[]; exclude?: string[]};

const mono = {fontFamily: 'var(--type-mono)'} as const;

const Chips = ({items, selected, onToggle}: {items: SuggestedTopic[]; selected: Set<string>; onToggle: (name: string) => void}) => (
    <div className="flex flex-wrap gap-2">
        {items.map((s) => {
            const on = selected.has(s.name);
            return (
                <button key={s.name} type="button" aria-pressed={on} onClick={() => onToggle(s.name)}
                        className={cn('rounded-full border px-3 py-1.5 text-xs transition-colors',
                            on ? 'border-brand bg-brand/10 text-brand' : 'border-line-strong/30 bg-surface-2/40 text-fg-soft hover:text-fg hover:border-brand/40')}
                        style={mono}>
                    {on ? '✓ ' : ''}{s.name}
                </button>
            );
        })}
    </div>
);

// First-visit onboarding: pick a few starters (curated + what the News Brain is
// tracking) or write your own. Server-side duplicate checks make re-runs safe.
const TopicsEmptyState = ({brainSuggestions}: {brainSuggestions: SuggestedTopic[]}) => {
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

    const followSelected = () => startTransition(async () => {
        const picks = all.filter((s) => selected.has(s.name));
        let created = 0;
        let lastError: string | undefined;
        for (const pick of picks) {
            const result = await createTopic({name: pick.name, keywords: pick.keywords, exclude: pick.exclude ?? []});
            if (result.success) created += 1; else lastError = result.message;
        }
        if (created > 0) toast.success(created === 1 ? 'Following 1 topic' : `Following ${created} topics`);
        if (lastError && created < picks.length) toast.error(lastError);
        router.refresh();
    });

    return (
        <div className="space-y-4">
            <div className="mb-2">
                <h1 className="text-2xl font-semibold text-fg mb-1" style={{fontFamily: 'var(--type-display)'}}>Topics</h1>
                <p className="text-sm text-fg-muted">Everything you follow, from every source we read</p>
            </div>
            <section className="glass-panel rounded-xl p-8 md:p-12">
                <div className="max-w-2xl">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center bg-brand/10 mb-4">
                        <span className="material-symbols-outlined text-brand">interests</span>
                    </div>
                    <h2 className="text-xl font-semibold text-fg" style={{fontFamily: 'var(--type-display)'}}>Follow what you care about</h2>
                    <p className="mt-2 text-sm text-fg-muted">
                        Topics track news from every source we read — markets, macro, tech, sport, anything. Pick a few to start, or write your own.
                    </p>
                </div>

                <div className="mt-6 space-y-5">
                    <div>
                        <div className="text-[10px] uppercase tracking-[0.14em] text-fg-muted mb-2" style={mono}>Popular starters</div>
                        <Chips items={STARTER_TOPICS} selected={selected} onToggle={toggle} />
                    </div>
                    {brainSuggestions.length > 0 && (
                        <div>
                            <div className="text-[10px] uppercase tracking-[0.14em] text-fg-muted mb-2" style={mono}>What the News Brain is tracking</div>
                            <Chips items={brainSuggestions} selected={selected} onToggle={toggle} />
                        </div>
                    )}
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-2" style={mono}>
                    <button type="button" onClick={followSelected} disabled={pending || selected.size === 0}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-[0.1em] bg-brand text-on-brand disabled:opacity-50">
                        {pending && <Loader2 className="size-3.5 animate-spin" />}
                        Follow {selected.size > 0 ? `${selected.size} selected` : 'selected'}
                    </button>
                    <button type="button" onClick={() => setComposerOpen(true)}
                            className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-[0.1em] text-fg-soft hover:text-fg border border-line-strong/40">
                        Write my own
                    </button>
                </div>
            </section>
            <TopicComposer open={composerOpen} onOpenChange={setComposerOpen} mode="create" />
        </div>
    );
};

export default TopicsEmptyState;
