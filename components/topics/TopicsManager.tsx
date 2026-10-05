'use client';

import {useState, useTransition} from "react";
import Link from "next/link";
import {toast} from "sonner";
import {Loader2} from "lucide-react";
import {useTopicsUi} from "@/components/topics/TopicsShell";
import TopicChips from "@/components/topics/TopicChips";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";
import MicroLabel from "@/components/primitives/MicroLabel";
import Badge from "@/components/primitives/Badge";
import ActionButton, {actionButton} from "@/components/primitives/ActionButton";
import {rowCard} from "@/components/primitives/RowCard";
import {createTopic, deleteTopic, followStarterTopics} from "@/lib/actions/topics.actions";
import {runWithToast, UNREACHABLE_MESSAGE} from "@/lib/action-toast";
import {formatCapped} from "@/lib/format";
import {MAX_TOPICS_PER_USER, UNSEEN_COUNT_CAP} from "@/lib/topics/config";
import {OFFER_GROUPS, offeredTopics, slotsLeft, toFollowInputs, toggleSelection, topicToInput} from "@/lib/topics/manage";
import {TOPIC_PICKER_COPY, TOPICS_MANAGE_COPY} from "@/lib/learn/copy/topics";
import TopicDigestNote from "@/components/topics/TopicDigestNote";
import type {SuggestedTopic, TopicOverviewItem, TopicView} from "@/lib/topics/types";

type Props = {
    // In stored order (createdAt), not the rail's: rows must not jump while editing.
    topics: TopicOverviewItem[];
    preinstalled: boolean;
    brainSuggestions: SuggestedTopic[];
};

// How long the removal toast, and the Undo it carries, stays up.
const UNDO_WINDOW_MS = 8000;

// Module-level so Undo still works once the view has gone: removing the last topic lands on the
// empty state, and the toast outlives it. A re-create, not a restore — the same name, keywords,
// exclusions and colour (topicToInput), hence the same slug and keyword set, under a new id.
const undoRemove = (topic: TopicView) =>
    runWithToast(() => createTopic(topicToInput(topic)), toast, {
        success: TOPICS_MANAGE_COPY.restored(topic.name),
        error: TOPICS_MANAGE_COPY.undoFailed,
    });

// The manage view's column (/topics?edit=1): the followed topics as rows to edit or remove, and
// the starters and brain suggestions not yet followed as chips. Nothing here calls
// router.refresh(): every topics action revalidates /topics, and a revalidating action re-renders
// the current URL in its own response, so rows, rail, count and chips update in one round trip.
const TopicsManager = ({topics, preinstalled, brainSuggestions}: Props) => {
    const {openComposer} = useTopicsUi();
    // Ids removed this session. Never pruned on success: the action promise resolves before the
    // re-rendered tree lands, so pruning there would flash the row back, and an ObjectId never recurs.
    const [removing, setRemoving] = useState<ReadonlySet<string>>(new Set());
    const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
    const [pending, startTransition] = useTransition();

    const visible = topics.filter((t) => !removing.has(t.id));
    const offers = offeredTopics(visible.map((t) => t.slug), brainSuggestions);
    const slots = slotsLeft(visible.length);
    const picks = toFollowInputs(offers, selected);

    // Immediate, no dialog: the row goes, the toast offers Undo. Rolled back on failure, as
    // FollowTopicButton's optimistic flip is.
    const remove = async (topic: TopicOverviewItem) => {
        setRemoving((prev) => new Set(prev).add(topic.id));
        const ok = await runWithToast(() => deleteTopic(topic.id), {
            success: (message) => toast.success(message, {
                duration: UNDO_WINDOW_MS,
                action: {label: TOPICS_MANAGE_COPY.undo, onClick: () => { void undoRemove(topic); }},
            }),
            error: (message) => toast.error(message),
        }, {success: TOPICS_MANAGE_COPY.removed(topic.name), error: TOPICS_MANAGE_COPY.removeFailed});
        if (!ok) {
            setRemoving((prev) => {
                const next = new Set(prev);
                next.delete(topic.id);
                return next;
            });
        }
    };

    const toggle = (slug: string) => {
        const {next, blocked} = toggleSelection(selected, slug, slots);
        if (blocked) toast.error(TOPICS_MANAGE_COPY.roomFor(slots));
        else setSelected(next);
    };

    // One call for the whole selection, so one first-run event fills every new topic (the
    // empty state's pattern). The view stays: followed chips leave with the re-rendered props.
    const follow = () => startTransition(async () => {
        const result = await followStarterTopics(picks)
            .catch(() => ({success: false, message: UNREACHABLE_MESSAGE, created: 0, firstSlug: null}));
        if (result.created > 0) toast.success(TOPIC_PICKER_COPY.following(result.created));
        if (result.message) toast.error(result.message);
        setSelected(new Set());
    });

    return (
        <>
            <Panel id="topics-manage">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <SectionHeading spacing="none">{TOPICS_MANAGE_COPY.yourTopics}</SectionHeading>
                        <p className="text-[11px] text-fg-muted mt-1 font-mono" data-manage-count>
                            {TOPICS_MANAGE_COPY.followedOf(visible.length, MAX_TOPICS_PER_USER)}
                        </p>
                        {/* Derived from the set itself (isUntouchedDefaultSet), so it leaves with the
                            first removal and comes back with an Undo — no flag to store. */}
                        {preinstalled && (
                            <p className="text-[11px] text-fg-soft mt-2 max-w-md">{TOPICS_MANAGE_COPY.preinstalled}</p>
                        )}
                    </div>
                    <Link href="/topics" replace className={actionButton({className: 'shrink-0'})} data-manage-done>
                        {TOPICS_MANAGE_COPY.done}
                    </Link>
                </div>
                <div className="mt-4"><TopicDigestNote /></div>
                <ul className="mt-4 space-y-2">
                    {visible.map((t) => (
                        <li key={t.id} className={rowCard({className: 'flex items-center gap-3 px-3 py-2'})} data-manage-row={t.slug}>
                            <span className="h-2 w-2 rounded-full shrink-0" style={{background: t.color ?? 'var(--brand)'}} aria-hidden="true" />
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    {/* Plain text: the rail beside it already links every topic. */}
                                    <span className="text-sm font-medium text-fg truncate">{t.name}</span>
                                    {t.unseenCount > 0 && (
                                        <Badge tone="brand" shape="pill">{TOPICS_MANAGE_COPY.newCount(formatCapped(t.unseenCount, UNSEEN_COUNT_CAP))}</Badge>
                                    )}
                                </div>
                                <p className="text-[11px] text-fg-muted font-mono truncate">
                                    {TOPICS_MANAGE_COPY.keywordLine(t.keywords, t.exclude)}
                                </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                <ActionButton variant="secondary" size="xs" aria-label={TOPICS_MANAGE_COPY.editRow(t.name)} data-manage-edit
                                              onClick={() => openComposer('edit', t)}>
                                    {TOPICS_MANAGE_COPY.edit}
                                </ActionButton>
                                <ActionButton variant="danger" size="xs" aria-label={TOPICS_MANAGE_COPY.removeRow(t.name)} data-manage-remove
                                              onClick={() => { void remove(t); }}>
                                    {TOPICS_MANAGE_COPY.remove}
                                </ActionButton>
                            </div>
                        </li>
                    ))}
                </ul>
            </Panel>

            <Panel id="topics-add">
                <SectionHeading>{TOPICS_MANAGE_COPY.addTopics}</SectionHeading>
                {slots === 0 && (
                    <p role="status" className="text-xs text-fg-muted">{TOPICS_MANAGE_COPY.atCap(MAX_TOPICS_PER_USER)}</p>
                )}
                {offers.length === 0 && slots > 0 && (
                    <p className="text-xs text-fg-muted">{TOPICS_MANAGE_COPY.nothingToAdd}</p>
                )}
                {offers.length > 0 && (
                    <div className={slots === 0 ? 'mt-4 space-y-5' : 'space-y-5'}>
                        {OFFER_GROUPS.map((group) => {
                            const items = offers.filter((offer) => offer.group === group);
                            if (items.length === 0) return null;
                            return (
                                <div key={group}>
                                    <MicroLabel as="div" className="mb-2">{TOPIC_PICKER_COPY.groups[group]}</MicroLabel>
                                    <TopicChips label={TOPIC_PICKER_COPY.groups[group]} items={items} selected={selected}
                                                onToggle={toggle} disabled={slots === 0} />
                                </div>
                            );
                        })}
                    </div>
                )}
                <div className="mt-5 flex flex-wrap items-center gap-2">
                    <ActionButton size="md" className="inline-flex items-center gap-2" onClick={follow}
                                  disabled={pending || picks.length === 0 || slots === 0}>
                        {pending && <Loader2 className="size-3.5 animate-spin" />}
                        {TOPIC_PICKER_COPY.followSelected(picks.length)}
                    </ActionButton>
                    <ActionButton variant="secondary" size="md" onClick={() => openComposer('create')} disabled={slots === 0}>
                        {TOPICS_MANAGE_COPY.addOwn}
                    </ActionButton>
                </div>
            </Panel>
        </>
    );
};

export default TopicsManager;
