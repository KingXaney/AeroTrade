import {requireUserId} from "@/lib/auth/session";
import {getCachedWatchlistSymbols} from "@/lib/stocks/watchlist-store";
import {getNewsFeedForPrefs, getNewsFeedPrefs, getTopicFeedBatch} from "@/lib/news/feed-store";
import {NEWS_PAGE_SIZE} from "@/lib/news/config";
import {describeNewsFeed} from "@/lib/news/feed-prefs";
import NewsArticleCard from "@/components/news/NewsArticleCard";
import NewsFeedEditor from "@/components/news/NewsFeedEditor";
import Panel from "@/components/primitives/Panel";
import PageTitle from "@/components/primitives/PageTitle";

type NewsPageProps = {
    searchParams: Promise<{edit?: string}>;
};

const NewsPage = async ({searchParams}: NewsPageProps) => {
    const userId = await requireUserId();

    const {edit} = await searchParams;
    const prefs = await getNewsFeedPrefs(userId);
    // This page reads the preference itself (the editor needs it), so unlike the widget and
    // /history it has to ask for the topic batch explicitly.
    const [watchlistSymbols, topicArticles] = await Promise.all([
        prefs.includeWatchlist
            ? getCachedWatchlistSymbols(userId).catch(() => [] as string[])
            : Promise.resolve([] as string[]),
        getTopicFeedBatch(userId),
    ]);
    const feed = await getNewsFeedForPrefs(prefs, {limit: NEWS_PAGE_SIZE, watchlistSymbols, topicArticles});

    return (
        <div className="space-y-4">
            <PageTitle title="News" subtitle={<span id="news-feed-summary">{describeNewsFeed(prefs)}</span>} />

            <NewsFeedEditor initial={prefs} startOpen={edit === '1'} />

            {feed.fallback && (
                <p role="status" className="text-[11px] text-warning px-1 font-mono">
                    Google News is unavailable right now — showing market wires instead of your feed.
                </p>
            )}

            {feed.articles.length === 0 ? (
                <Panel pad={8} className="text-center">
                    <span className="material-symbols-outlined text-3xl text-fg-muted">feed</span>
                    <p className="mt-2 text-sm text-fg-muted">No headlines right now — try again in a few minutes.</p>
                </Panel>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {feed.articles.map((article) => <NewsArticleCard key={article.id} article={article} />)}
                </div>
            )}
        </div>
    );
};

export default NewsPage;
