'use client';

import {useState, useTransition} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {Loader2, MoreHorizontal, RefreshCw} from "lucide-react";
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from "@/components/ui/dropdown-menu";
import KeywordChips from "@/components/topics/KeywordChips";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import {useTopicsUi} from "@/components/topics/TopicsShell";
import {deleteTopic, requestTopicRefreshAction} from "@/lib/actions/topics.actions";
import {formatTimeAgo} from "@/lib/utils";

const REFRESH_DISABLE_MS = 30_000;
const mono = {fontFamily: 'var(--type-mono)'} as const;

const TopicHeader = ({topic}: {topic: TopicOverviewItem}) => {
    const router = useRouter();
    const {openComposer} = useTopicsUi();
    const [refreshing, startRefresh] = useTransition();
    const [cooldown, setCooldown] = useState(false);
    const [confirming, setConfirming] = useState(false);

    const refresh = () => startRefresh(async () => {
        const result = await requestTopicRefreshAction(topic.id);
        if (!result.success) {
            toast.error(result.message ?? 'Could not refresh');
            return;
        }
        toast.success(result.message ?? 'Refresh queued');
        setCooldown(true);
        setTimeout(() => { setCooldown(false); router.refresh(); }, REFRESH_DISABLE_MS);
    });

    const remove = async () => {
        const result = await deleteTopic(topic.id);
        if (!result.success) {
            toast.error(result.message ?? 'Could not remove the topic');
            return;
        }
        toast.success(`Stopped following "${topic.name}"`);
        router.push('/topics');
        router.refresh();
    };

    const refreshed = topic.lastFetchedAt ? `refreshed ${formatTimeAgo(Math.floor(topic.lastFetchedAt / 1000))}` : 'never refreshed';

    return (
        <section className="glass-panel rounded-xl p-5">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{background: topic.color ?? 'var(--brand)'}} aria-hidden="true" />
                        <h2 className="text-xl font-semibold text-fg truncate" style={{fontFamily: 'var(--type-display)'}}>{topic.name}</h2>
                    </div>
                    <p className="text-[11px] text-fg-muted mt-1" style={mono}>
                        {topic.unseenCount} unseen · {topic.articleCount} tracked · {refreshed}
                    </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    <button type="button" onClick={refresh} disabled={refreshing || cooldown}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-[0.1em] text-fg-soft hover:text-fg border border-line-strong/40 disabled:opacity-50"
                            style={mono}>
                        {refreshing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                        {refreshing ? 'Refreshing…' : 'Refresh now'}
                    </button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button type="button" aria-label="Topic actions" className="inline-flex items-center justify-center size-8 rounded-lg text-fg-muted hover:text-fg hover:bg-surface-3">
                                <MoreHorizontal className="size-4" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem onClick={() => openComposer('edit', topic)}>Edit keywords</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setConfirming(true)} className="text-negative focus:text-negative">Stop following</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
            <div className="mt-3 space-y-2">
                <KeywordChips values={topic.keywords} ariaLabel="Keywords" />
                {topic.exclude.length > 0 && <KeywordChips values={topic.exclude} variant="exclude" ariaLabel="Exclusions" />}
            </div>
            <ConfirmDialog
                open={confirming}
                onOpenChange={setConfirming}
                title={`Stop following “${topic.name}”?`}
                description="Its matched articles are removed. This cannot be undone."
                confirmLabel="Stop following"
                destructive
                onConfirm={remove}
            />
        </section>
    );
};

export default TopicHeader;
