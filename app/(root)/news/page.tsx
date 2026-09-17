import {redirect} from "next/navigation";
import {getCurrentUserId} from "@/lib/actions/watchlist.actions";
import {getCachedWatchlistSymbols} from "@/lib/dashboard/cached";
import {getNewsFeedForPrefs, getNewsFeedPrefs} from "@/lib/news/feed-store";
import {NEWS_PAGE_SIZE} from "@/lib/news/config";
import {describeNewsFeed} from "@/lib/news/feed-prefs";
import NewsArticleCard from "@/components/news/NewsArticleCard";
import NewsFeedEditor from "@/components/news/NewsFeedEditor";

type NewsPageProps = {
    searchParams: Promise<{edit?: string}>;
};

const NewsPage = async ({searchParams}: NewsPageProps) => {
    const userId = await getCurrentUserId();
    if (!userId) redirect('/sign-in');

    const {edit} = await searchParams;
    const prefs = await getNewsFeedPrefs(userId);
    const watchlistSymbols = prefs.includeWatchlist
        ? await getCachedWatchlistSymbols(userId).catch(() => [] as string[])
        : [];
    const feed = await getNewsFeedForPrefs(prefs, {limit: NEWS_PAGE_SIZE, watchlistSymbols});

    return (
        <div className="space-y-4">
            <div className="mb-2">
                <h1 className="text-2xl font-semibold text-fg mb-1" style={{fontFamily: 'var(--type-display)'}}>
                    News
                </h1>
                <p id="news-feed-summary" className="text-sm text-fg-muted" style={{fontFamily: 'var(--type-mono)'}}>
                    {describeNewsFeed(prefs)}
                </p>
            </div>

            <NewsFeedEditor initial={prefs} startOpen={edit === '1'} />

            {feed.fallback && (
                <p role="status" className="text-[11px] text-warning px-1" style={{fontFamily: 'var(--type-mono)'}}>
                    Google News is unavailable right now — showing market wires instead of your feed.
                </p>
            )}

            {feed.articles.length === 0 ? (
                <section className="glass-panel rounded-xl p-8 text-center">
                    <span className="material-symbols-outlined text-3xl text-fg-muted">feed</span>
                    <p className="mt-2 text-sm text-fg-muted">No headlines right now — try again in a few minutes.</p>
                </section>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {feed.articles.map((article) => <NewsArticleCard key={article.id} article={article} />)}
                </div>
            )}
        </div>
    );
};

export default NewsPage;
