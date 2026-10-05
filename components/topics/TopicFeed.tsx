'use client';

import {useState, useTransition} from "react";
import {Loader2} from "lucide-react";
import TopicArticleCard from "@/components/topics/TopicArticleCard";
import {fetchTopicFeedPage} from "@/lib/actions/topics.actions";
import type {MergedTopicArticle, TopicArticleView} from '@/lib/topics/types';
import ActionButton from "@/components/primitives/ActionButton";

type MergedOrPlain = TopicArticleView | MergedTopicArticle;

type Props = {
    topicId?: string;             // enables "Load more" (single-topic feed)
    initial: MergedOrPlain[];
    unseenCount?: number;         // the first N initial items are marked "New"
    pageSize?: number;
    showTopicTag?: boolean;
    layout?: 'card' | 'row';
};

const isMerged = (a: MergedOrPlain): a is MergedTopicArticle => 'topicSlug' in a;

const TopicFeed = ({topicId, initial, unseenCount = 0, pageSize = 20, showTopicTag = false, layout = 'card'}: Props) => {
    // Seeded once. The pages key this component with topicFeedKey, so a refresh that
    // hands it a different first page remounts it rather than being ignored here.
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
            <div className={layout === 'row' ? 'space-y-2' : 'grid grid-cols-1 gap-4 md:grid-cols-2'}>
                {articles.map((a, i) => (
                    <TopicArticleCard
                        key={`${a.contentHash}-${isMerged(a) ? a.topicSlug : ''}`}
                        article={a}
                        isNew={i < unseenCount}
                        layout={layout}
                        topic={showTopicTag && isMerged(a) ? {name: a.topicName, slug: a.topicSlug, color: a.topicColor} : undefined}
                    />
                ))}
            </div>
            <p aria-live="polite" className="sr-only">{articles.length} articles shown</p>
            {error && <p className="mt-3 text-xs text-negative">{error}</p>}
            {topicId && !exhausted && (
                <div className="mt-4 flex justify-center">
                    <ActionButton variant="secondary" size="md" className="inline-flex items-center gap-2" onClick={loadMore} disabled={pending}>
                        {pending && <Loader2 className="size-3.5 animate-spin" />}
                        Load more
                    </ActionButton>
                </div>
            )}
        </div>
    );
};

export default TopicFeed;
