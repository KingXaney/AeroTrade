import ArticleCard from "@/components/news/ArticleCard";
import SourceBadge from "@/components/topics/SourceBadge";
import type {TopicArticleView} from '@/lib/topics/types';

const MAX_TERM_CHIPS = 3;

// 1–3 dots: how strongly the article matched the topic's keywords.
const relevanceDots = (score: number): number => (score >= 6 ? 3 : score >= 3 ? 2 : 1);

// A followed topic's article on the shared ArticleCard skeleton: the outlet's badge, the topic
// and a "New" mark in the tag row; the matched keywords and a relevance meter before "Read more".
type Props = {
    article: TopicArticleView;
    isNew?: boolean;
    topic?: {name: string; slug: string; color: string | null};
};

const TopicArticleCard = ({article, isNew = false, topic}: Props) => {
    const dots = relevanceDots(article.score);
    const terms = article.matchedTerms.slice(0, MAX_TERM_CHIPS);
    const extraTerms = article.matchedTerms.length - terms.length;

    return (
        <ArticleCard
            url={article.url}
            headline={article.headline}
            datetime={article.datetime}
            source={article.source || 'Unknown source'}
            summary={article.summary}
            tag={(
                <div className="flex items-center gap-2 mb-4 flex-wrap">
                    <SourceBadge sourceType={article.sourceType} source={article.source} />
                    {topic && (
                        <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] text-fg-muted" style={{fontFamily: 'var(--type-mono)'}}>
                            <span className="h-1.5 w-1.5 rounded-full" style={{background: topic.color ?? 'var(--brand)'}} aria-hidden="true" />
                            {topic.name}
                        </span>
                    )}
                    {isNew && (
                        <span className="ml-auto inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.1em] text-brand" style={{fontFamily: 'var(--type-mono)'}}>
                            <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden="true" />
                            New
                        </span>
                    )}
                </div>
            )}
            chips={(
                <div className="flex items-center gap-1.5 flex-wrap">
                    {terms.map((t) => (
                        <span key={t} className="rounded px-1.5 py-0.5 text-[10px] bg-surface-3 text-fg-muted" style={{fontFamily: 'var(--type-mono)'}}>{t}</span>
                    ))}
                    {extraTerms > 0 && <span className="text-[10px] text-fg-muted" style={{fontFamily: 'var(--type-mono)'}}>+{extraTerms}</span>}
                    <span className="inline-flex items-center gap-0.5 ml-1" title={`Relevance ${article.score}`} aria-label={`Relevance ${dots} of 3`}>
                        {[1, 2, 3].map((i) => (
                            <span key={i} className={i <= dots ? 'h-1.5 w-1.5 rounded-full bg-brand' : 'h-1.5 w-1.5 rounded-full bg-surface-4'} />
                        ))}
                    </span>
                </div>
            )}
        />
    );
};

export default TopicArticleCard;
