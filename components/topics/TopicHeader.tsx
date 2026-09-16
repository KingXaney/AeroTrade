'use client';

import {useState} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {MoreHorizontal} from "lucide-react";
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from "@/components/ui/dropdown-menu";
import KeywordChips from "@/components/topics/KeywordChips";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import RefreshTopicButton from "@/components/topics/RefreshTopicButton";
import {useTopicsUi} from "@/components/topics/TopicsShell";
import {deleteTopic} from "@/lib/actions/topics.actions";
import {refreshCooldownUntil} from "@/lib/topics/config";
import {formatTimeAgo} from "@/lib/utils";

const mono = {fontFamily: 'var(--type-mono)'} as const;

// `now` is the server render instant, so the refresh button's cooldown hydrates deterministically.
const TopicHeader = ({topic, now}: {topic: TopicOverviewItem; now: number}) => {
    const router = useRouter();
    const {openComposer} = useTopicsUi();
    const [confirming, setConfirming] = useState(false);

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
                    <RefreshTopicButton topicId={topic.id} cooldownUntil={refreshCooldownUntil(topic.refreshRequestedAt)} serverNow={now} />
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
