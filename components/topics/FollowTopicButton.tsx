'use client';

import {useState, useTransition, type MouseEvent} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {Loader2, Sparkles} from "lucide-react";
import {cn} from "@/lib/utils";
import {createTopic, deleteTopic} from "@/lib/actions/topics.actions";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

type Props = {
    name: string;
    keywords: string[];
    followed?: {id: string; slug: string} | null;   // set when the user already follows it
    type?: 'button' | 'icon';
    className?: string;
};

// Same optimistic pattern as WatchlistButton: flip first, roll back on failure.
const FollowTopicButton = ({name, keywords, followed = null, type = 'icon', className}: Props) => {
    const router = useRouter();
    const [state, setState] = useState(followed);
    const [confirming, setConfirming] = useState(false);
    const [pending, startTransition] = useTransition();

    const follow = () => {
        startTransition(async () => {
            const result = await createTopic({name, keywords});
            if (!result.success || !result.topic) {
                toast.error(result.message ?? 'Could not follow this topic');
                return;
            }
            const topic = result.topic;
            setState({id: topic.id, slug: topic.slug});
            toast.success(`Following "${topic.name}"`, {
                action: {label: 'Edit keywords', onClick: () => router.push(`/topics/${topic.slug}`)},
            });
            router.refresh();
        });
    };

    const unfollow = async () => {
        const previous = state;
        if (!previous) return;
        setState(null);
        const result = await deleteTopic(previous.id);
        if (!result.success) {
            setState(previous);
            toast.error(result.message ?? 'Could not unfollow this topic');
            return;
        }
        toast.success(`Stopped following "${name}"`);
        router.refresh();
    };

    const onClick = (e: MouseEvent<HTMLButtonElement>) => {
        // Often rendered inside clickable rows.
        e.preventDefault();
        e.stopPropagation();
        if (state) setConfirming(true);
        else follow();
    };

    const following = state !== null;
    const label = following ? 'Following news' : 'Follow news';

    return (
        <>
            {type === 'button' ? (
                <button type="button" onClick={onClick} disabled={pending} aria-pressed={following}
                        className={cn('inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-[0.1em] transition-colors disabled:opacity-50',
                            following ? 'border border-brand/40 text-brand' : 'bg-brand text-on-brand', className)}
                        style={{fontFamily: 'var(--type-mono)'}}>
                    {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                    {label}
                </button>
            ) : (
                <button type="button" onClick={onClick} disabled={pending} aria-pressed={following} aria-label={`${label}: ${name}`}
                        title={following ? 'Following as a topic' : 'Follow this as a topic'}
                        className={cn('inline-flex items-center justify-center size-7 rounded-md transition-colors disabled:opacity-50',
                            following ? 'text-brand' : 'text-fg-muted hover:text-brand', className)}>
                    {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                </button>
            )}
            <ConfirmDialog
                open={confirming}
                onOpenChange={setConfirming}
                title={`Stop following “${name}”?`}
                description="Its matched articles are removed. This cannot be undone."
                confirmLabel="Stop following"
                destructive
                onConfirm={unfollow}
            />
        </>
    );
};

export default FollowTopicButton;
