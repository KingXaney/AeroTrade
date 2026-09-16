'use client';

import {useEffect, useRef, useState, useSyncExternalStore, useTransition} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {Loader2, RefreshCw} from "lucide-react";
import {requestTopicRefreshAction} from "@/lib/actions/topics.actions";
import {cn} from "@/lib/utils";

// How long after a queued refresh to re-read the page for articles. The on-demand
// job is one search plus a bulk upsert, so new rows exist within seconds.
const RESULT_CHECK_DELAY_MS = 20_000;

const mono = {fontFamily: 'var(--type-mono)'} as const;

const secondsBetween = (until: number | null, now: number): number =>
    until ? Math.max(0, Math.ceil((until - now) / 1000)) : 0;

// A once-a-second clock that exists only while a button is mounted.
const subscribeClock = (onChange: () => void) => {
    const id = setInterval(onChange, 1000);
    return () => clearInterval(id);
};

// The server snapshot is computed from `serverNow` — the instant the page was
// rendered, passed down as a prop — so SSR and hydration agree exactly and a topic
// under cooldown is disabled from the very first paint, not only after hydration.
const useSecondsUntil = (until: number | null, serverNow: number): number =>
    useSyncExternalStore(
        subscribeClock,
        () => secondsBetween(until, Date.now()),
        () => secondsBetween(until, serverNow),
    );

const countdownLabel = (seconds: number): string =>
    seconds >= 60 ? `Refresh in ${Math.ceil(seconds / 60)} min` : `Refresh in ${seconds}s`;

type Props = {
    topicId: string;
    cooldownUntil: number | null;   // refreshCooldownUntil(topic.refreshRequestedAt), computed by the caller
    serverNow: number;              // Date.now() taken in the server component that rendered this page
    variant?: 'primary' | 'ghost';
    className?: string;
};

// Owns the whole "Refresh now" lifecycle: claim → queued → re-read → cooldown.
// The button it replaces disabled itself for a fixed 30 s against a 10-minute
// server cooldown, so the second click always failed; and its bare
// setTimeout(router.refresh) could fire on whatever page the user had moved to.
const RefreshTopicButton = ({topicId, cooldownUntil, serverNow, variant = 'ghost', className}: Props) => {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    // A claim learned from our own click, tied to the topic it was taken for. The
    // server's prop always merges in — it wins after a refresh delivers a later value,
    // and a re-targeted button (the merged empty state can switch topics) drops the
    // stale claim instead of showing another topic's countdown.
    const [claim, setClaim] = useState<{topicId: string; until: number} | null>(null);
    const until = Math.max(cooldownUntil ?? 0, claim?.topicId === topicId ? claim.until : 0) || null;
    const seconds = useSecondsUntil(until, serverNow);
    const recheck = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => () => { if (recheck.current) clearTimeout(recheck.current); }, []);

    const refresh = () => startTransition(async () => {
        const result = await requestTopicRefreshAction(topicId);
        // The server's cooldown is the truth, whether the click succeeded or was refused.
        if (typeof result.cooldownUntil === 'number') setClaim({topicId, until: result.cooldownUntil});
        if (!result.success) {
            toast.error(result.message ?? 'Could not refresh');
            return;
        }
        toast.success(result.message ?? 'Refresh queued');
        // Re-read now so any sibling button for this topic (header + empty state)
        // picks up the claim from the server, then again once articles have landed.
        router.refresh();
        if (recheck.current) clearTimeout(recheck.current);
        recheck.current = setTimeout(() => { recheck.current = null; router.refresh(); }, RESULT_CHECK_DELAY_MS);
    });

    const cooling = seconds > 0;
    return (
        <button type="button" onClick={refresh} disabled={pending || cooling}
                title={cooling ? 'Each topic can be refreshed once every ten minutes' : undefined}
                className={cn('inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-[0.1em] disabled:opacity-50',
                    variant === 'primary' ? 'bg-brand text-on-brand' : 'text-fg-soft hover:text-fg border border-line-strong/40',
                    className)}
                style={mono}>
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            {pending ? 'Refreshing…' : cooling ? countdownLabel(seconds) : 'Refresh now'}
        </button>
    );
};

export default RefreshTopicButton;
