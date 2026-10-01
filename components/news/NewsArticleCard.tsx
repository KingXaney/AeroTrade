import {cn} from "@/lib/utils";
import ArticleCard from "@/components/news/ArticleCard";
import type {MarketNewsArticle} from '@/lib/news/types';

// The market-news card on every headline surface — the News page, the dashboard widget and
// /history — on the shared ArticleCard skeleton (which also decides whether the summary
// says more than the headline).
//
// When the article arrived through a followed topic, that topic takes the tag slot. The
// slot's job is to answer "what is this about", and for a topic article the topic is the
// answer — otherwise the user has no way to tell why their feed changed after they
// followed something, and a sync nobody can see is not worth much. The outlet is not
// lost; it is already on the meta line below.
const NewsArticleCard = ({article}: {article: MarketNewsArticle}) => {
    const topic = article.topic;
    return (
        <ArticleCard
            url={article.url}
            headline={article.headline}
            datetime={article.datetime}
            source={article.source}
            summary={article.summary}
            tag={(
                <span className={cn('news-tag', topic && 'text-brand')} data-topic={topic?.slug}>
                    {topic ? topic.name : (article.related || article.source)}
                </span>
            )}
        />
    );
};

export default NewsArticleCard;
