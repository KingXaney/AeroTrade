const LABELS: Record<NewsSourceType, string> = {
    finance: 'Markets',
    rss: 'News',
    reddit: 'Reddit',
    sec: 'SEC filing',
    web: 'News',
};

const SourceBadge = ({sourceType, source}: {sourceType: NewsSourceType; source?: string}) => (
    <span className="news-tag !mb-0" title={source || undefined}>{LABELS[sourceType] ?? 'News'}</span>
);

export default SourceBadge;
