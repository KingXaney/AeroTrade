import {formatTimeAgo} from "@/lib/utils";
import SourceBadge from "@/components/topics/SourceBadge";

const MAX_TERM_CHIPS = 3;

// 1–3 dots: how strongly the article matched the topic's keywords.
const relevanceDots = (score: number): number => (score >= 6 ? 3 : score >= 3 ? 2 : 1);

type Props = {
    article: TopicArticleView;
    isNew?: boolean;
    topic?: {name: string; slug: string; color: string | null};
};

const TopicArticleCard = ({article, isNew = false, topic}: Props) => {
    const dots = relevanceDots(article.score);
    const terms = article.matchedTerms.slice(0, MAX_TERM_CHIPS);
    const extraTerms = article.matchedTerms.length - terms.length;
    const showSummary = article.summary && article.summary.replace(/\.{3}$/, '') !== article.headline;

    return (
        <a href={article.url} target="_blank" rel="noopener noreferrer" className="news-item flex flex-col">
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
            <h3 className="news-title">{article.headline}</h3>
            <p className="news-meta">{formatTimeAgo(article.datetime)} · {article.source || 'Unknown source'}</p>
            {showSummary && <p className="news-summary">{article.summary}</p>}
            <div className="mt-auto flex items-center justify-between gap-2 flex-wrap">
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
                <span className="news-cta">Read more →</span>
            </div>
        </a>
    );
};

export default TopicArticleCard;
