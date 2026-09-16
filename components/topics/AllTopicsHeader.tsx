'use client';

import {Plus} from "lucide-react";
import {useTopicsUi} from "@/components/topics/TopicsShell";

const AllTopicsHeader = ({count, unseenTotal}: {count: number; unseenTotal: number}) => {
    const {openComposer} = useTopicsUi();
    return (
        <section className="glass-panel rounded-xl p-5 flex items-center justify-between gap-3">
            <div>
                <h2 className="text-xl font-semibold text-fg" style={{fontFamily: 'var(--type-display)'}}>All topics</h2>
                <p className="text-[11px] text-fg-muted mt-1" style={{fontFamily: 'var(--type-mono)'}}>
                    {count} followed · {unseenTotal} unseen
                </p>
            </div>
            <button type="button" onClick={() => openComposer('create')}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-[0.1em] bg-brand text-on-brand"
                    style={{fontFamily: 'var(--type-mono)'}}>
                <Plus className="size-4" />
                New topic
            </button>
        </section>
    );
};

export default AllTopicsHeader;
