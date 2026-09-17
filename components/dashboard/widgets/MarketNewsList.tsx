import Link from "next/link";
import NewsArticleCard from "@/components/news/NewsArticleCard";

// Two columns from `md`, so the count steps in pairs with the widget's width.
const countForSpan = (span: number): number => (span >= 12 ? 8 : span >= 8 ? 6 : 4);

// The user's news feed, sized to the widget. A panel widget's `href` is inert in the
// shell (only link chrome renders it), so the body carries its own way to the editor.
const MarketNewsList = ({news, span = 6}: {news: MarketNewsArticle[]; span?: number}) => {
    if (news.length === 0) {
        return (
            <p className="text-sm text-fg-muted">
                No headlines right now — <Link href="/news" className="text-brand hover:underline">check your feed</Link>.
            </p>
        );
    }
    return (
        <div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {news.slice(0, countForSpan(span)).map((article) => <NewsArticleCard key={article.id} article={article} />)}
            </div>
            <Link href="/news" className="inline-block mt-3 text-xs text-brand hover:underline" style={{fontFamily: 'var(--type-mono)'}}>
                Edit your feed →
            </Link>
        </div>
    );
};

export default MarketNewsList;
