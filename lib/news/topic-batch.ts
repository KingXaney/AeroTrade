// Followed topics as a news-feed batch.
//
// Pure on purpose: the articles are already fetched, scored and stored by the 3-hourly
// refreshTopicFeeds job, so folding them into the feed is a shape change over a Mongo
// read — not another network request. That is why topics never become a FeedRequest and
// nothing about URL planning, MAX_FEED_REQUESTS or the Google kill switch changes.

import {hashId} from "@/lib/news/config";
import {feedUrlKey} from "@/lib/news/feed";

// `id` is keyed exactly as mergeFeed re-keys its output, so a topic article and the same
// story arriving from a wire collapse into one row instead of appearing twice.
export const toFeedArticles = (merged: readonly MergedTopicArticle[]): MarketNewsArticle[] =>
    merged.map((article) => ({
        id: hashId(feedUrlKey(article.url)),
        headline: article.headline,
        summary: article.summary,
        source: article.source,
        url: article.url,
        datetime: article.datetime,
        category: 'topic',
        related: '',
        sourceType: article.sourceType,
        topic: {name: article.topicName, slug: article.topicSlug, color: article.topicColor},
    }));
