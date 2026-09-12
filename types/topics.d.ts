declare global {
    // --- Followed topics ---
    type TopicBriefView = {
        summary: string;
        bullets: string[];
        date: string;             // 'YYYY-MM-DD' ET
        generatedAt: number;      // epoch ms
    };

    type TopicView = {
        id: string;
        name: string;
        slug: string;
        keywords: string[];
        exclude: string[];
        color: string | null;
        keywordSetHash: number;
        createdAt: number;        // epoch ms
        lastFetchedAt: number | null;
        lastSeenAt: number | null;
        refreshRequestedAt: number | null;   // last "Refresh now" claim; drives the button's cooldown
        brief: TopicBriefView | null;
    };

    type TopicArticleView = {
        contentHash: number;
        headline: string;
        summary: string;
        url: string;
        source: string;
        sourceType: NewsSourceType;
        datetime: number;         // unix seconds
        score: number;
        matchedTerms: string[];
    };

    type TopicOverviewItem = TopicView & {
        unseenCount: number;
        articleCount: number;
        latest: TopicArticleView | null;
    };

    type TopicsOverview = {
        topics: TopicOverviewItem[];
        unseenTotal: number;
    };

    type MergedTopicArticle = TopicArticleView & {
        topicId: string;
        topicName: string;
        topicSlug: string;
        topicColor: string | null;
    };
}

export {};
