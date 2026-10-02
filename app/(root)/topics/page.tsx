import type {Metadata} from "next";
import {requireUserId} from "@/lib/auth/session";
import {getTopicsPageView, MERGED_FEED_SIZE} from "@/lib/topics/page-store";
import TopicsShell from "@/components/topics/TopicsShell";
import AllTopicsHeader from "@/components/topics/AllTopicsHeader";
import TopicFeed from "@/components/topics/TopicFeed";
import TopicFeedEmpty from "@/components/topics/TopicFeedEmpty";
import TopicsEmptyState from "@/components/topics/TopicsEmptyState";

// The browser tab's title; app/layout.tsx appends the app's name.
export const metadata: Metadata = {title: "Topics"};

// The seed safety net, the first-run fetch and the brain's suggestions live in
// getTopicsPageView (lib/topics/page-store.ts); the page only composes its view.
const TopicsPage = async () => {
    const userId = await requireUserId();
    const view = await getTopicsPageView(userId);

    if (view.kind === 'empty') {
        return <TopicsEmptyState brainSuggestions={view.brainSuggestions} canRestoreDefaults />;
    }

    const {overview, articles} = view;
    // eslint-disable-next-line react-hooks/purity -- server component: the render instant is captured once so the refresh button's cooldown hydrates deterministically
    const now = Date.now();
    return (
        <TopicsShell overview={overview}>
            <AllTopicsHeader count={overview.topics.length} unseenTotal={overview.unseenTotal} preinstalled={view.preinstalled} />
            {articles.length > 0
                ? <TopicFeed key={view.feedKey} initial={articles} showTopicTag pageSize={MERGED_FEED_SIZE} />
                : <TopicFeedEmpty scope="all" topics={overview.topics} now={now} />}
        </TopicsShell>
    );
};

export default TopicsPage;
