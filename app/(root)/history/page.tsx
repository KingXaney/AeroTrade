import Link from "next/link";
import {redirect} from "next/navigation";
import {getCurrentUserId, getWatchlistForUser} from "@/lib/actions/watchlist.actions";
import {getNews} from "@/lib/actions/finnhub.actions";
import {formatTimeAgo} from "@/lib/utils";

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

    const items = await getWatchlistForUser(userId);
    const symbols = items.map((i) => i.symbol);

    // News personalized to the watchlist when present, otherwise general market news.
    let news: MarketNewsArticle[] = [];
    try {
        news = await getNews(symbols.length > 0 ? symbols : undefined);
    } catch {
        news = [];
    }

    return (
        <div className="min-h-screen space-y-6">
            {/* Page Header */}
            <div className="mb-2">
                <h1 className="text-2xl font-semibold text-[#e2e2e8] mb-1 tracking-tight"
                    style={{ fontFamily: 'var(--font-sora)' }}>
                    Activity History
                </h1>
                <p className="text-sm text-[#849495]"
                   style={{ fontFamily: 'var(--font-jetbrains)', letterSpacing: '0.02em' }}>
                    Your watchlist timeline and market activity
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Watchlist activity timeline */}
                <section className="lg:col-span-1 glass-panel rounded-xl p-6">
                    <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-[#7df4ff] mb-4"
                        style={{ fontFamily: 'var(--font-jetbrains)' }}>
                        Watchlist Activity
                    </h2>

                    {items.length === 0 ? (
                        <p className="text-sm text-[#849495]">
                            No activity yet. Add a stock to your watchlist to start your timeline.
                        </p>
                    ) : (
                        <ol className="relative space-y-5 border-l border-[rgba(125,244,255,0.15)] pl-5">
                            {items.map((item) => (
                                <li key={item.symbol} className="relative">
                                    <span className="absolute -left-[1.4rem] top-1 w-2.5 h-2.5 rounded-full bg-[#7df4ff]" />
                                    <Link href={`/stocks/${item.symbol}`} className="group block">
                                        <p className="text-sm text-[#e2e2e8] group-hover:text-[#7df4ff] transition-colors">
                                            Added <span className="font-semibold">{item.symbol}</span>
                                            <span className="text-[#849495]"> — {item.company}</span>
                                        </p>
                                        <p className="text-[10px] text-[#849495] mt-0.5"
                                           style={{ fontFamily: 'var(--font-jetbrains)', letterSpacing: '0.02em' }}>
                                            {formatAddedAt(item.addedAt)}
                                        </p>
                                    </Link>
                                </li>
                            ))}
                        </ol>
                    )}
                </section>

                {/* Related market news */}
                <section className="lg:col-span-2 space-y-4">
                    <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-[#7df4ff]"
                        style={{ fontFamily: 'var(--font-jetbrains)' }}>
                        {symbols.length > 0 ? 'News For Your Watchlist' : 'Market News'}
                    </h2>

                    {news.length === 0 ? (
                        <div className="glass-panel rounded-xl p-6">
                            <p className="text-sm text-[#849495]">No recent news available right now.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {news.map((article) => (
                                <a
                                    key={article.id}
                                    href={article.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="news-item flex flex-col"
                                >
                                    <span className="news-tag">{article.related || article.source}</span>
                                    <h3 className="news-title">{article.headline}</h3>
                                    <p className="news-meta">{formatTimeAgo(article.datetime)} · {article.source}</p>
                                    <p className="news-summary">{article.summary}</p>
                                    <span className="news-cta mt-auto">Read more →</span>
                                </a>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
};

export default HistoryPage;
