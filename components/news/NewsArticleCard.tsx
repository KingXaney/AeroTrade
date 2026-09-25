import {cn, formatTimeAgo} from "@/lib/utils";

// One card for every headline surface — the News page, the dashboard widget and
// /history. This markup used to live twice, inline. The summary is shown only when it
// says more than the headline: Google News items carry no summary, so formatArticle
// hands back the headline itself (possibly truncated with "...").
//
// When the article arrived through a followed topic, that topic takes the tag slot. The
// slot's job is to answer "what is this about", and for a topic article the topic is the
// answer — otherwise the user has no way to tell why their feed changed after they
// followed something, and a sync nobody can see is not worth much. The outlet is not
// lost; it is already on the meta line below.
const NewsArticleCard = ({article}: {article: MarketNewsArticle}) => {
    const summary = (article.summary ?? '').replace(/\.{3}$/, '').trim();
    const showSummary = summary.length > 0 && !article.headline.trim().startsWith(summary);
    const topic = article.topic;
    return (
        <a href={article.url} target="_blank" rel="noopener noreferrer" className="news-item flex flex-col">
            <span className={cn('news-tag', topic && 'text-brand')} data-topic={topic?.slug}>
                {topic ? topic.name : (article.related || article.source)}
            </span>
            <h3 className="news-title">{article.headline}</h3>
            <p className="news-meta">{formatTimeAgo(article.datetime)} · {article.source}</p>
            {showSummary && <p className="news-summary">{article.summary}</p>}
            <span className="news-cta mt-auto">Read more →</span>
        </a>
    );
};

export default NewsArticleCard;
