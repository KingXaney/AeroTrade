'use client';

import {createContext, useContext, useMemo, useState, type ReactNode} from "react";
import TopicRail from "@/components/topics/TopicRail";
import PageTitle from "@/components/primitives/PageTitle";
import TopicComposer, {type ComposerMode} from "@/components/topics/TopicComposer";
import type {TopicView, TopicsOverview} from '@/lib/topics/types';

type TopicsUi = {openComposer: (mode: ComposerMode, initial?: TopicView | null) => void};

const TopicsUiContext = createContext<TopicsUi | null>(null);

export const useTopicsUi = (): TopicsUi => {
    const ctx = useContext(TopicsUiContext);
    if (!ctx) throw new Error('useTopicsUi must be used inside <TopicsShell>');
    return ctx;
};

type Props = {
    overview: TopicsOverview;
    activeSlug?: string;
    children: ReactNode;    // the server-rendered feed column
};

// One composer instance for the whole page; the rail, headers and empty feeds open it.
const TopicsShell = ({overview, activeSlug, children}: Props) => {
    const [composer, setComposer] = useState<{open: boolean; mode: ComposerMode; initial: TopicView | null}>({open: false, mode: 'create', initial: null});
    const ui = useMemo<TopicsUi>(() => ({
        openComposer: (mode, initial = null) => setComposer({open: true, mode, initial}),
    }), []);

    return (
        <TopicsUiContext.Provider value={ui}>
            <div className="space-y-4">
                <PageTitle title="Topics" subtitle="Everything you follow, from every source we read" />
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                    <div className="lg:col-span-3 lg:sticky lg:top-24">
                        <TopicRail topics={overview.topics} activeSlug={activeSlug} unseenTotal={overview.unseenTotal}
                                   onNewTopic={() => ui.openComposer('create')} />
                    </div>
                    <div className="lg:col-span-9 space-y-4">{children}</div>
                </div>
                <TopicComposer open={composer.open} mode={composer.mode} initial={composer.initial}
                               onOpenChange={(open) => setComposer((c) => ({...c, open}))} />
            </div>
        </TopicsUiContext.Provider>
    );
};

export default TopicsShell;
