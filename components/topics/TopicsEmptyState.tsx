'use client';

import {useState, useTransition} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {Loader2} from "lucide-react";
import TopicComposer from "@/components/topics/TopicComposer";
import TopicChips from "@/components/topics/TopicChips";
import Panel from "@/components/primitives/Panel";
import PageTitle from "@/components/primitives/PageTitle";
import MicroLabel from "@/components/primitives/MicroLabel";
import {followStarterTopics, restoreDefaultTopics} from "@/lib/actions/topics.actions";
import {OFFER_GROUPS, offeredTopics, slotsLeft, toFollowInputs, toggleSelection} from "@/lib/topics/manage";
import {TOPIC_PICKER_COPY, TOPICS_MANAGE_COPY} from "@/lib/learn/copy/topics";
import type {SuggestedTopic} from "@/lib/topics/types";
import ActionButton from "@/components/primitives/ActionButton";

// Reached two ways now. For a new account this is dead code — topics are seeded at
// sign-up — so getting here means the user unfollowed everything on purpose, and
// `canRestoreDefaults` offers the way back. It is no longer a wall in front of the app.
const TopicsEmptyState = ({brainSuggestions, canRestoreDefaults = false}: {brainSuggestions: SuggestedTopic[]; canRestoreDefaults?: boolean}) => {
    const router = useRouter();
    const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
    const [composerOpen, setComposerOpen] = useState(false);
    const [pending, startTransition] = useTransition();

    // Nothing is followed, so every starter and brain suggestion is on offer, keyed by slug.
    const offers = offeredTopics([], brainSuggestions);
    const slots = slotsLeft(0);
    const toggle = (slug: string) => {
        const {next, blocked} = toggleSelection(selected, slug, slots);
        if (blocked) toast.error(TOPICS_MANAGE_COPY.roomFor(slots));
        else setSelected(next);
    };

    // Land on the first new topic: its page does a bounded live fetch, so the first thing
    // seen is articles rather than a merged feed waiting on a job. push() alone — a
    // refresh() on top would render that page (and its live fetch) a second time before
    // the first has stamped lastFetchedAt.
    const land = (firstSlug: string | null) => {
        if (firstSlug) router.push(`/topics/${firstSlug}`);
        else router.refresh();
    };

    const followSelected = () => startTransition(async () => {
        const result = await followStarterTopics(toFollowInputs(offers, selected));
        if (result.created > 0) toast.success(TOPIC_PICKER_COPY.following(result.created));
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
                    {OFFER_GROUPS.map((group) => {
                        const items = offers.filter((offer) => offer.group === group);
                        if (items.length === 0) return null;
                        return (
                            <div key={group}>
                                <MicroLabel as="div" className="mb-2">{TOPIC_PICKER_COPY.groups[group]}</MicroLabel>
                                <TopicChips label={TOPIC_PICKER_COPY.groups[group]} items={items} selected={selected} onToggle={toggle} />
                            </div>
                        );
                    })}
                </div>

                <div className="font-mono mt-6 flex flex-wrap items-center gap-2">
                    <ActionButton size="md" className="inline-flex items-center gap-2" onClick={followSelected} disabled={pending || selected.size === 0}>
                        {pending && <Loader2 className="size-3.5 animate-spin" />}
                        {TOPIC_PICKER_COPY.followSelected(selected.size)}
                    </ActionButton>
                    {canRestoreDefaults && (
                        <ActionButton variant="secondary" size="md" onClick={restoreDefaults} disabled={pending}>
                            Restore the default topics
                        </ActionButton>
                    )}
                    <ActionButton variant="secondary" size="md" onClick={() => setComposerOpen(true)}>
                        Write my own
                    </ActionButton>
                </div>
            </Panel>
            <TopicComposer open={composerOpen} onOpenChange={setComposerOpen} mode="create" />
        </div>
    );
};

export default TopicsEmptyState;
