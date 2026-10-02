import type {Metadata} from "next";
import {notFound} from "next/navigation";
import {requireUserId} from "@/lib/auth/session";
import {getTopicPageView, TOPIC_PAGE_SIZE} from "@/lib/topics/page-store";
import TopicsShell from "@/components/topics/TopicsShell";
import TopicHeader from "@/components/topics/TopicHeader";
import TopicBrief from "@/components/topics/TopicBrief";
import TopicFeed from "@/components/topics/TopicFeed";
import TopicFeedEmpty from "@/components/topics/TopicFeedEmpty";
import TopicSeenMarker from "@/components/topics/TopicSeenMarker";
import {TOPIC_BRIEF_COPY} from "@/lib/learn/copy/topics";

// The browser tab's title; app/layout.tsx appends the app's name.
export const metadata: Metadata = {title: "Topics"};

type TopicPageProps = {params: Promise<{slug: string}>};

// The first-visit fetch and the re-read after it live in getTopicPageView
// (lib/topics/page-store.ts); the page only composes its view.
const TopicPage = async ({params}: TopicPageProps) => {
    const userId = await requireUserId();

    const {slug} = await params;
    const view = await getTopicPageView(userId, slug);
    if (!view) notFound();
    const {overview, topic, articles} = view;
    // eslint-disable-next-line react-hooks/purity -- server component: the render instant is captured once so the refresh button's cooldown hydrates deterministically
    const now = Date.now();

    return (
        <TopicsShell overview={overview} activeSlug={slug}>
            <TopicHeader topic={topic} now={now} />
            <TopicSeenMarker topicId={topic.id} unseenCount={topic.unseenCount} />
            {topic.brief
                ? <TopicBrief brief={topic.brief} />
                : articles.length > 0 && (
                    <p className="text-xs text-fg-muted px-1 font-mono">
                        {TOPIC_BRIEF_COPY.firstBrief}
                    </p>
                )}
            {articles.length > 0
                ? <TopicFeed key={view.feedKey} topicId={topic.id} initial={articles}
                             unseenCount={topic.unseenCount} pageSize={TOPIC_PAGE_SIZE} />
                : <TopicFeedEmpty scope="topic" topic={topic} now={now} />}
        </TopicsShell>
    );
};

export default TopicPage;
