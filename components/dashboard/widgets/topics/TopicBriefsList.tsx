import Link from "next/link";
import TopicBrief from "@/components/topics/TopicBrief";
import TopicsWidgetEmpty from "@/components/dashboard/widgets/topics/TopicsWidgetEmpty";
import WidgetUnavailable from "@/components/dashboard/WidgetUnavailable";
import type {TopicsOverview} from '@/lib/topics/types';
import RowCard from "@/components/primitives/RowCard";

const MAX_BRIEFS = 3;

// Newest briefs first; two topics on the same keyword set share one brief, so show it once.
const TopicBriefsList = ({overview}: {overview: TopicsOverview}) => {
    if (overview.topics.length === 0) return <TopicsWidgetEmpty />;

    const seen = new Set<number>();
    const briefed = overview.topics
        .filter((t) => {
            if (!t.brief || seen.has(t.keywordSetHash)) return false;
            seen.add(t.keywordSetHash);
            return true;
        })
        .sort((a, b) => (b.brief?.generatedAt ?? 0) - (a.brief?.generatedAt ?? 0))
        .slice(0, MAX_BRIEFS);

    if (briefed.length === 0) {
        return <WidgetUnavailable text="No briefs yet — they arrive each morning once a topic has enough new articles." />;
    }

    return (
        <div className="space-y-3">
            {briefed.map((t) => t.brief && (
                <RowCard key={t.id} className="p-4">
                    <Link href={`/topics/${t.slug}`} className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-fg transition-colors hover:text-brand font-heading">
                        <span className="h-2 w-2 rounded-full" style={{background: t.color ?? 'var(--brand)'}} aria-hidden="true" />
                        {t.name}
                    </Link>
                    <TopicBrief brief={t.brief} compact />
                </RowCard>
            ))}
        </div>
    );
};

export default TopicBriefsList;
