'use client';

import {useState, useTransition} from "react";
import {Loader2} from "lucide-react";
import TopicArticleCard from "@/components/topics/TopicArticleCard";
import {fetchTopicFeedPage} from "@/lib/actions/topics.actions";

type MergedOrPlain = TopicArticleView | MergedTopicArticle;

type Props = {
    topicId?: string;             // enables "Load more" (single-topic feed)
    initial: MergedOrPlain[];
    unseenCount?: number;         // the first N initial items are marked "New"
    pageSize?: number;
    showTopicTag?: boolean;
};

const isMerged = (a: MergedOrPlain): a is MergedTopicArticle => 'topicSlug' in a;

const TopicFeed = ({topicId, initial, unseenCount = 0, pageSize = 20, showTopicTag = false}: Props) => {
    const [articles, setArticles] = useState<MergedOrPlain[]>(initial);
    const [exhausted, setExhausted] = useState(initial.length < pageSize);
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    const loadMore = () => {
        if (!topicId || articles.length === 0) return;
        const before = articles[articles.length - 1].datetime;
        startTransition(async () => {
            const result = await fetchTopicFeedPage({topicId, before, limit: pageSize});
            if (!result.success) {
                setError(result.message ?? 'Could not load more articles');
                return;
            }
            setError(null);
            setArticles((prev) => [...prev, ...result.articles]);
            if (result.articles.length < pageSize) setExhausted(true);
        });
    };

    if (articles.length === 0) return null;

    return (
        <div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {articles.map((a, i) => (
                    <TopicArticleCard
                        key={`${a.contentHash}-${isMerged(a) ? a.topicSlug : ''}`}
                        article={a}
                        isNew={i < unseenCount}
                        topic={showTopicTag && isMerged(a) ? {name: a.topicName, slug: a.topicSlug, color: a.topicColor} : undefined}
                    />
                ))}
            </div>
            <p aria-live="polite" className="sr-only">{articles.length} articles shown</p>
            {error && <p className="mt-3 text-xs text-negative">{error}</p>}
            {topicId && !exhausted && (
                <div className="mt-4 flex justify-center">
                    <button type="button" onClick={loadMore} disabled={pending}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-[0.1em] text-fg-soft hover:text-fg border border-line-strong/40 disabled:opacity-50"
                            style={{fontFamily: 'var(--type-mono)'}}>
                        {pending && <Loader2 className="size-3.5 animate-spin" />}
                        Load more
                    </button>
                </div>
            )}
        </div>
    );
};

export default TopicFeed;
