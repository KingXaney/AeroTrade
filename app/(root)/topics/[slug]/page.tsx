import {notFound, redirect} from "next/navigation";
import {getCurrentUserId} from "@/lib/actions/watchlist.actions";
import {ensureTopicHasArticles, getTopicArticles, getTopicsOverview} from "@/lib/topics/store";
import TopicsShell from "@/components/topics/TopicsShell";
import TopicHeader from "@/components/topics/TopicHeader";
import TopicBrief from "@/components/topics/TopicBrief";
import TopicFeed from "@/components/topics/TopicFeed";
import TopicFeedEmpty from "@/components/topics/TopicFeedEmpty";
import TopicSeenMarker from "@/components/topics/TopicSeenMarker";

const PAGE_SIZE = 20;

type TopicPageProps = {params: Promise<{slug: string}>};

const TopicPage = async ({params}: TopicPageProps) => {
    const userId = await getCurrentUserId();
    if (!userId) redirect('/sign-in');

    const {slug} = await params;
    let overview = await getTopicsOverview(userId);
    let topic = overview.topics.find((t) => t.slug === slug);
    if (!topic) notFound();

    // A brand-new topic gets one bounded live fetch so its first visit isn't empty;
    // counts and "refreshed …" come from a second read so the header isn't stale.
    if (await ensureTopicHasArticles(topic)) {
        overview = await getTopicsOverview(userId);
        topic = overview.topics.find((t) => t.slug === slug) ?? topic;
    }
    const articles = await getTopicArticles(topic.keywordSetHash, {limit: PAGE_SIZE});
    // eslint-disable-next-line react-hooks/purity -- server component: the render instant is captured once so the refresh button's cooldown hydrates deterministically
    const now = Date.now();

    return (
        <TopicsShell overview={overview} activeSlug={slug}>
            <TopicHeader topic={topic} now={now} />
            <TopicSeenMarker topicId={topic.id} unseenCount={topic.unseenCount} />
            {topic.brief
                ? <TopicBrief brief={topic.brief} />
                : articles.length > 0 && (
                    <p className="text-xs text-fg-muted px-1" style={{fontFamily: 'var(--type-mono)'}}>
                        Your first &ldquo;what changed today&rdquo; brief arrives after tonight&apos;s refresh.
                    </p>
                )}
            {articles.length > 0
                ? <TopicFeed topicId={topic.id} initial={articles} unseenCount={topic.unseenCount} pageSize={PAGE_SIZE} />
                : <TopicFeedEmpty scope="topic" topic={topic} now={now} />}
        </TopicsShell>
    );
};

export default TopicPage;
