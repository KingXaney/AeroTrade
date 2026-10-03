import type {Metadata} from "next";
import {requireUserId} from "@/lib/auth/session";
import {getTopicsPageView, MERGED_FEED_SIZE} from "@/lib/topics/page-store";
import TopicsShell from "@/components/topics/TopicsShell";
import AllTopicsHeader from "@/components/topics/AllTopicsHeader";
import TopicFeed from "@/components/topics/TopicFeed";
import TopicFeedEmpty from "@/components/topics/TopicFeedEmpty";
import TopicsEmptyState from "@/components/topics/TopicsEmptyState";
import TopicsManager from "@/components/topics/TopicsManager";

// The browser tab's title; app/layout.tsx appends the app's name.
export const metadata: Metadata = {title: "Topics"};

type TopicsPageProps = {searchParams: Promise<{edit?: string}>};

// The seed safety net, the first-run fetch and the brain's suggestions live in
// getTopicsPageView (lib/topics/page-store.ts); the page only composes its view. `?edit=1` is
// the manage view: the same shell and rail, the feed column replaced by the rows and the picker.
const TopicsPage = async ({searchParams}: TopicsPageProps) => {
    const userId = await requireUserId();
    const {edit} = await searchParams;
    const view = await getTopicsPageView(userId, {manage: edit === '1'});

    if (view.kind === 'empty') {
        return <TopicsEmptyState brainSuggestions={view.brainSuggestions} canRestoreDefaults />;
    }

    if (view.kind === 'manage') {
        return (
            <TopicsShell overview={view.overview} stayOnSave>
                <TopicsManager topics={view.overview.topics} preinstalled={view.preinstalled} brainSuggestions={view.brainSuggestions} />
            </TopicsShell>
        );
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
