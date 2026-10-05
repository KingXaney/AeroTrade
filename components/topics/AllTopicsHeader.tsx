'use client';

import Link from "next/link";
import {Plus, Settings2} from "lucide-react";
import {useTopicsUi} from "@/components/topics/TopicsShell";
import {formatCapped} from "@/lib/format";
import {UNSEEN_COUNT_CAP} from "@/lib/topics/config";
import Panel from "@/components/primitives/Panel";
import ActionButton, {actionButton} from "@/components/primitives/ActionButton";
import {TOPICS_MANAGE_COPY} from "@/lib/learn/copy/topics";
import TopicDigestNote from "@/components/topics/TopicDigestNote";

const AllTopicsHeader = ({count, unseenTotal, preinstalled}: {count: number; unseenTotal: number; preinstalled: boolean}) => {
    const {openComposer} = useTopicsUi();
    // Two buttons no longer fit beside the heading on a phone: below `sm` they drop under it.
    return (
        <Panel className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
                <h2 className="font-heading text-xl font-semibold text-fg">Topics you follow</h2>
                <p className="mt-1 text-xs text-fg-muted">
                    {count} followed · {formatCapped(unseenTotal, UNSEEN_COUNT_CAP)} unseen
                </p>
                {/* Self-extinguishing: it disappears the moment the set stops being ours,
                    so there is no dismissal flag to store and nothing to keep in sync. */}
                {preinstalled && <p className="mt-2 max-w-md text-xs text-fg-soft">{TOPICS_MANAGE_COPY.preinstalled}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
                {/* The manage view, for bulk changes; "New topic" stays the one-click path. */}
                <Link href="/topics?edit=1" className={actionButton({variant: 'secondary', className: 'inline-flex items-center gap-2'})} data-topics-edit>
                    <Settings2 className="size-4" />
                    {TOPICS_MANAGE_COPY.editTopics}
                </Link>
                <ActionButton className="inline-flex items-center gap-2" onClick={() => openComposer('create')}>
                    <Plus className="size-4" />
                    New topic
                </ActionButton>
            </div>
            <div className="w-full basis-full">
                <TopicDigestNote />
            </div>
        </Panel>
    );
};

export default AllTopicsHeader;
