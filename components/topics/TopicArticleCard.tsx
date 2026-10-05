import ArticleCard from "@/components/news/ArticleCard";
import ArticleRow from "@/components/news/ArticleRow";
import SourceBadge from "@/components/topics/SourceBadge";
import type {TopicArticleView} from '@/lib/topics/types';
import MicroLabel from "@/components/primitives/MicroLabel";

const MAX_TERM_CHIPS = 3;

// 1–3 dots: how strongly the article matched the topic's keywords.
const relevanceDots = (score: number): number => (score >= 6 ? 3 : score >= 3 ? 2 : 1);

// A followed topic article: page feeds use the compact row layout; library widgets keep the
// card layout. Both show the source, topic and new marker, plus matched terms and relevance.
type Props = {
    article: TopicArticleView;
    isNew?: boolean;
    topic?: {name: string; slug: string; color: string | null};
    layout?: 'card' | 'row';
};

const TopicArticleCard = ({article, isNew = false, topic, layout = 'card'}: Props) => {
    const dots = relevanceDots(article.score);
    const terms = article.matchedTerms.slice(0, MAX_TERM_CHIPS);
    const extraTerms = article.matchedTerms.length - terms.length;

    const tag = (
        <>
            <SourceBadge sourceType={article.sourceType} source={article.source} />
            {topic && (
                <MicroLabel className="inline-flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full" style={{background: topic.color ?? 'var(--brand)'}} aria-hidden="true" />
                    {topic.name}
                </MicroLabel>
            )}
            {isNew && <MicroLabel tone="brand">New</MicroLabel>}
        </>
    );
    const chips = (
        <>
            {terms.map((t) => (
                <span key={t} className="rounded px-1.5 py-0.5 text-[10px] bg-surface-3 text-fg-muted">{t}</span>
            ))}
            {extraTerms > 0 && <span className="text-[10px] text-fg-muted">+{extraTerms}</span>}
            <span className="ml-1 inline-flex items-center gap-0.5" title={`Relevance ${article.score}`} aria-label={`Relevance ${dots} of 3`}>
                {[1, 2, 3].map((i) => (
                    <span key={i} className={i <= dots ? 'size-1.5 rounded-full bg-brand' : 'size-1.5 rounded-full bg-surface-4'} />
                ))}
            </span>
        </>
    );

    if (layout === 'row') {
        return <ArticleRow url={article.url} headline={article.headline} datetime={article.datetime}
                           source={article.source || 'Unknown source'} summary={article.summary} tag={tag} chips={chips} />;
    }

    return (
        <ArticleCard
            url={article.url}
            headline={article.headline}
            datetime={article.datetime}
            source={article.source || 'Unknown source'}
            summary={article.summary}
            tag={(
                <div className="flex items-center gap-2 mb-4 flex-wrap">
                    {tag}
                </div>
            )}
            chips={<div className="flex items-center gap-1.5 flex-wrap">{chips}</div>}
        />
    );
};

export default TopicArticleCard;
