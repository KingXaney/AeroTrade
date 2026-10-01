import type {ReactNode} from "react";
import {formatTimeAgoSeconds} from "@/lib/format";
import {showSummary} from "@/lib/news/article";

// The one headline card skeleton, behind NewsArticleCard (the News page, the dashboard widget,
// /history) and TopicArticleCard (a topic's feed and its widget): the tag slot, the headline,
// the age and outlet, the summary when it says more than the headline (lib/news/article's
// showSummary), and the "Read more" cue — alone at the foot, or after `chips` on one footer line.
type Props = {
    url: string;
    headline: string;
    datetime: number;
    source: string;
    summary?: string | null;
    tag: ReactNode;
    chips?: ReactNode;
};

const ArticleCard = ({url, headline, datetime, source, summary, tag, chips}: Props) => (
    <a href={url} target="_blank" rel="noopener noreferrer" className="news-item flex flex-col">
        {tag}
        <h3 className="news-title">{headline}</h3>
        <p className="news-meta">{formatTimeAgoSeconds(datetime)} · {source}</p>
        {showSummary(headline, summary) && <p className="news-summary">{summary}</p>}
        {chips ? (
            <div className="mt-auto flex items-center justify-between gap-2 flex-wrap">
                {chips}
                <span className="news-cta">Read more →</span>
            </div>
        ) : (
            <span className="news-cta mt-auto">Read more →</span>
        )}
    </a>
);

export default ArticleCard;
