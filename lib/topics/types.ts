// A followed topic, its brief and its articles, as the topics pages and widgets read them.
import type {NewsSourceType} from '@/lib/news/types';

export type TopicLink = {name: string; slug: string};

export type TopicBriefView = {
    summary: string;
    bullets: string[];
    date: string;             // 'YYYY-MM-DD' ET
    generatedAt: number;      // epoch ms
};

export type TopicView = {
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

export type TopicArticleView = {
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

export type TopicOverviewItem = TopicView & {
    unseenCount: number;
    articleCount: number;
    latest: TopicArticleView | null;
};

export type TopicsOverview = {
    topics: TopicOverviewItem[];
    unseenTotal: number;
};

export type MergedTopicArticle = TopicArticleView & {
    topicId: string;
    topicName: string;
    topicSlug: string;
    topicColor: string | null;
};
