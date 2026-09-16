import TopicArticleCard from "@/components/topics/TopicArticleCard";

// The merged feed, each card tagged with the topic it matched.
const TopicsLatest = ({articles, span}: {articles: MergedTopicArticle[]; span: number}) => (
    <div className={span >= 12 ? 'grid gap-4 md:grid-cols-2 xl:grid-cols-3' : 'grid gap-4 md:grid-cols-2'}>
        {articles.map((a) => (
            <TopicArticleCard
                key={`${a.topicId}:${a.contentHash}`}
                article={a}
                topic={{name: a.topicName, slug: a.topicSlug, color: a.topicColor}}
            />
        ))}
    </div>
);

export default TopicsLatest;
