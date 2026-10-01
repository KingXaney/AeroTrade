'use client';

import {Plus} from "lucide-react";
import {useTopicsUi} from "@/components/topics/TopicsShell";
import Panel from "@/components/primitives/Panel";
import ActionButton from "@/components/primitives/ActionButton";

const AllTopicsHeader = ({count, unseenTotal, preinstalled}: {count: number; unseenTotal: number; preinstalled: boolean}) => {
    const {openComposer} = useTopicsUi();
    return (
        <Panel className="flex items-center justify-between gap-3">
            <div>
                <h2 className="text-xl font-semibold text-fg" style={{fontFamily: 'var(--type-display)'}}>All topics</h2>
                <p className="text-[11px] text-fg-muted mt-1" style={{fontFamily: 'var(--type-mono)'}}>
                    {count} followed · {unseenTotal} unseen
                </p>
                {/* Self-extinguishing: it disappears the moment the set stops being ours,
                    so there is no dismissal flag to store and nothing to keep in sync. */}
                {preinstalled && (
                    <p className="text-[11px] text-fg-soft mt-2 max-w-md">
                        These came preinstalled to get you started — edit or remove any of them, or add your own.
                    </p>
                )}
            </div>
            <ActionButton className="inline-flex items-center gap-2" onClick={() => openComposer('create')}>
                <Plus className="size-4" />
                New topic
            </ActionButton>
        </Panel>
    );
};

export default AllTopicsHeader;
