'use client';

import Link from "next/link";
import {Plus, Settings2} from "lucide-react";
import {useTopicsUi} from "@/components/topics/TopicsShell";
import {formatCapped} from "@/lib/format";
import {UNSEEN_COUNT_CAP} from "@/lib/topics/config";
import Panel from "@/components/primitives/Panel";
import ActionButton, {actionButton} from "@/components/primitives/ActionButton";
import {TOPICS_MANAGE_COPY} from "@/lib/learn/copy/topics";

const AllTopicsHeader = ({count, unseenTotal, preinstalled}: {count: number; unseenTotal: number; preinstalled: boolean}) => {
    const {openComposer} = useTopicsUi();
    // Two buttons no longer fit beside the heading on a phone: below `sm` they drop under it.
    return (
        <Panel className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="min-w-0">
                <h2 className="text-xl font-semibold text-fg font-heading">All topics</h2>
                <p className="text-[11px] text-fg-muted mt-1 font-mono">
                    {count} followed · {formatCapped(unseenTotal, UNSEEN_COUNT_CAP)} unseen
                </p>
                {/* Self-extinguishing: it disappears the moment the set stops being ours,
                    so there is no dismissal flag to store and nothing to keep in sync. */}
                {preinstalled && (
                    <p className="text-[11px] text-fg-soft mt-2 max-w-md">{TOPICS_MANAGE_COPY.preinstalled}</p>
                )}
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
        </Panel>
    );
};

export default AllTopicsHeader;
