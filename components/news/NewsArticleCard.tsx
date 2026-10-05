import {cn} from "@/lib/utils";
import ArticleCard from "@/components/news/ArticleCard";
import ArticleRow from "@/components/news/ArticleRow";
import type {MarketNewsArticle} from '@/lib/news/types';

// One market-news view: compact cards on dashboard widgets and /history, editorial rows on
// /news. Both use the same summary rule as the shared ArticleCard skeleton.
//
// When the article arrived through a followed topic, that topic takes the tag slot. The
// slot's job is to answer "what is this about", and for a topic article the topic is the
// answer — otherwise the user has no way to tell why their feed changed after they
// followed something, and a sync nobody can see is not worth much. The outlet is not
// lost; it is already on the meta line below.
const NewsArticleCard = ({article, layout = 'card'}: {article: MarketNewsArticle; layout?: 'card' | 'row'}) => {
    const topic = article.topic;
    if (layout === 'row') {
        return (
            <ArticleRow
                url={article.url}
                headline={article.headline}
                datetime={article.datetime}
                source={article.source}
                summary={article.summary}
                tag={(
                    <span className={cn('label-type text-xs', topic && 'text-brand')} data-topic={topic?.slug}>
                        {topic ? topic.name : (article.related || article.category || 'Market news')}
                    </span>
                )}
            />
        );
    }
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
