import Link from "next/link";
import {redirect} from "next/navigation";
import {getCurrentUserId, getWatchlistForUser} from "@/lib/actions/watchlist.actions";
import {getNewsFeed} from "@/lib/news/feed-store";
import {NEWS_HISTORY_LIMIT} from "@/lib/news/config";
import {getRecentTradesForUser} from "@/lib/trading/account";
import TradeHistory from "@/components/trade/TradeHistory";
import NewsArticleCard from "@/components/news/NewsArticleCard";

const formatAddedAt = (date: Date) =>
    new Date(date).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });

const HistoryPage = async () => {
    const userId = await getCurrentUserId();
    if (!userId) redirect('/sign-in');

    const [items, recent] = await Promise.all([getWatchlistForUser(userId), getRecentTradesForUser(userId)]);

    // The user's own feed (Google News top stories unless they changed it); a feed
    // failure never takes the page down.
    let news: MarketNewsArticle[] = [];
    try {
        news = (await getNewsFeed(userId, {limit: NEWS_HISTORY_LIMIT})).articles;
    } catch {
        news = [];
    }

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="mb-2">
                <h1 className="text-2xl font-semibold text-fg mb-1 tracking-tight"
                    style={{ fontFamily: 'var(--type-display)' }}>
                    History
                </h1>
                <p className="text-sm text-fg-muted"
                   style={{ fontFamily: 'var(--type-mono)', letterSpacing: '0.02em' }}>
                    Your trades across every strategy, and what you have added to your watchlist
                </p>
            </div>

            {/* A page called History used to contain no trades. Removals are not recorded
                (the watchlist model hard-deletes), so the list below is honest about being
                "by date added", not a timeline. */}
            <section className="glass-panel rounded-xl p-6">
                <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-brand mb-4"
                    style={{ fontFamily: 'var(--type-mono)' }}>
                    Trades
                </h2>
                <TradeHistory trades={recent.trades} totalCount={recent.total} />
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Watchlist, by date added */}
                <section className="lg:col-span-1 glass-panel rounded-xl p-6">
                    <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-brand mb-4"
                        style={{ fontFamily: 'var(--type-mono)' }}>
                        On your watchlist, by date added
                    </h2>

                    {items.length === 0 ? (
                        <p className="text-sm text-fg-muted">
                            Nothing yet. Add a stock to your watchlist and it appears here with the date you added it.
                        </p>
                    ) : (
                        <ol className="relative space-y-5 border-l border-brand/15 pl-5">
                            {items.map((item) => (
                                <li key={item.symbol} className="relative">
                                    <span className="absolute -left-[1.4rem] top-1 w-2.5 h-2.5 rounded-full bg-brand" />
                                    <Link href={`/stocks/${item.symbol}`} className="group block">
                                        <p className="text-sm text-fg group-hover:text-brand transition-colors">
                                            Added <span className="font-semibold">{item.symbol}</span>
                                            <span className="text-fg-muted"> — {item.company}</span>
                                        </p>
                                        <p className="text-[10px] text-fg-muted mt-0.5"
                                           style={{ fontFamily: 'var(--type-mono)', letterSpacing: '0.02em' }}>
                                            {formatAddedAt(item.addedAt)}
                                        </p>
                                    </Link>
                                </li>
                            ))}
                        </ol>
                    )}
                </section>

                {/* The user's news feed */}
                <section className="lg:col-span-2 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                        <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-brand"
                            style={{ fontFamily: 'var(--type-mono)' }}>
                            Your news feed
                        </h2>
                        <Link href="/news?edit=1" className="text-xs text-brand hover:underline" style={{ fontFamily: 'var(--type-mono)' }}>
                            Edit feed →
                        </Link>
                    </div>

                    {news.length === 0 ? (
                        <div className="glass-panel rounded-xl p-6">
                            <p className="text-sm text-fg-muted">No headlines right now — try again in a few minutes.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {news.map((article) => <NewsArticleCard key={article.id} article={article} />)}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
};

export default HistoryPage;
