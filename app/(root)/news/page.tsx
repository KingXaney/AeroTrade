import type {Metadata} from "next";
import Link from "next/link";
import {requireUserId} from "@/lib/auth/session";
import {getNewsFeedPrefs} from "@/lib/news/feed-store";
import {getNewsPageView} from "@/lib/news/page-store";
import {describeNewsFeed} from "@/lib/news/feed-prefs";
import {eventBadge, eventTermsShown} from "@/lib/brain/event-types";
import {NEWS_COPY} from "@/lib/learn/copy/news";
import {formatCapped} from "@/lib/format";
import {UNSEEN_COUNT_CAP} from "@/lib/topics/config";
import ArticleRow from "@/components/news/ArticleRow";
import NewsArticleCard from "@/components/news/NewsArticleCard";
import NewsBriefing from "@/components/news/NewsBriefing";
import NewsFeedEditor from "@/components/news/NewsFeedEditor";
import NewsSeenMarker from "@/components/news/NewsSeenMarker";
import WhatTheseMean from "@/components/learn/WhatTheseMean";
import Badge from "@/components/primitives/Badge";
import Disclosure from "@/components/primitives/Disclosure";
import MicroLabel from "@/components/primitives/MicroLabel";
import PageTitle from "@/components/primitives/PageTitle";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";
import Term from "@/components/primitives/Term";

// The browser tab's title; app/layout.tsx appends the app's name.
export const metadata: Metadata = {title: "News"};

type NewsPageProps = {
    searchParams: Promise<{edit?: string}>;
};

// The news, processed: morning briefing, followed topics, holdings and watchlist, then market
// headlines. The sections and their rules live in lib/news/page.ts.
const NewsPage = async ({searchParams}: NewsPageProps) => {
    const userId = await requireUserId();

    const {edit} = await searchParams;
    const prefs = await getNewsFeedPrefs(userId);
    const view = await getNewsPageView(userId, prefs);
    const hasMainStories = view.topics.length > 0 || view.lead.length > 0;
    const nothing = !view.briefing && view.topics.length === 0 && view.holdings.length === 0 && view.lead.length === 0;

    return (
        <div className="space-y-5">
            <PageTitle title="News" subtitle={<span id="news-feed-summary">{describeNewsFeed(prefs)}</span>}
                       actions={<NewsFeedEditor initial={prefs} startOpen={edit === '1'} />} />
            <NewsSeenMarker />

            {view.fallback && (
                <p role="status" className="px-1 text-xs text-warning">{NEWS_COPY.fallback}</p>
            )}

            {view.briefing && (
                <Panel id="news-briefing" aria-labelledby="news-briefing-heading">
                    <NewsBriefing briefing={view.briefing}/>
                </Panel>
            )}

            <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-12">
                {hasMainStories && (
                    <div className={`space-y-4 ${view.holdings.length > 0 ? 'xl:col-span-8' : 'xl:col-span-12'}`}>
                        {view.topics.length > 0 && (
                            <Panel id="news-topics" aria-labelledby="news-topics-heading">
                                <div className="mb-4 flex items-start justify-between gap-3">
                                    <div>
                                        <SectionHeading id="news-topics-heading" spacing="none">{NEWS_COPY.topicsHeading}</SectionHeading>
                                        <p className="mt-1 text-xs text-fg-muted">{NEWS_COPY.topicsNote}</p>
                                    </div>
                                    <Link href="/topics" className="label-type shrink-0 text-xs text-brand hover:underline">
                                        {NEWS_COPY.topicsLink}{view.moreTopics > 0 ? ` · ${NEWS_COPY.moreTopics(view.moreTopics)}` : ''} →
                                    </Link>
                                </div>
                                <div className="divide-y divide-line-strong/20">
                                    {view.topics.map((topic) => (
                                        <section key={topic.slug} className="py-5 first:pt-0 last:pb-0" data-news-topic={topic.slug}>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="size-2 shrink-0 rounded-full" style={{background: topic.color ?? 'var(--brand)'}} aria-hidden="true" />
                                                <Link href={`/topics/${topic.slug}`} className="font-heading text-base font-semibold text-fg transition-colors hover:text-brand">
                                                    {topic.name}
                                                </Link>
                                                {topic.unseenCount > 0 && (
                                                    <Badge tone="brand" shape="pill" aria-label={`${formatCapped(topic.unseenCount, UNSEEN_COUNT_CAP)} unseen`}>
                                                        {formatCapped(topic.unseenCount, UNSEEN_COUNT_CAP)} new
                                                    </Badge>
                                                )}
                                            </div>
                                            {topic.brief && (
                                                <div className="mt-2 max-w-3xl">
                                                    <p className="text-sm leading-relaxed text-fg-soft">{topic.brief.summary}</p>
                                                    <MicroLabel as="div" className="mt-1">{NEWS_COPY.briefingCaveat(topic.brief.date)}</MicroLabel>
                                                </div>
                                            )}
                                            {topic.articles.length > 0 ? (
                                                <div className="mt-3 space-y-2">
                                                    {topic.articles.map((article) => <NewsArticleCard key={article.id} article={article} layout="row"/>)}
                                                </div>
                                            ) : (
                                                <p className="mt-2 text-xs text-fg-muted">{NEWS_COPY.topicQuiet}</p>
                                            )}
                                        </section>
                                    ))}
                                </div>
                            </Panel>
                        )}

                        {view.lead.length > 0 && (
                            <Panel id="news-top" aria-labelledby="news-top-heading">
                                <SectionHeading id="news-top-heading">{NEWS_COPY.topHeading}</SectionHeading>
                                <div className="space-y-2">
                                    {view.lead.map((article) => <NewsArticleCard key={article.id} article={article} layout="row"/>)}
                                </div>
                                {view.more.length > 0 && (
                                    <Disclosure className="mt-4" id="news-more" summary={NEWS_COPY.moreHeadlines(view.more.length)}>
                                        <div className="mt-3 space-y-2">
                                            {view.more.map((article) => <NewsArticleCard key={article.id} article={article} layout="row"/>)}
                                        </div>
                                    </Disclosure>
                                )}
                            </Panel>
                        )}
                    </div>
                )}

                {view.holdings.length > 0 && (
                    <aside className={hasMainStories ? 'xl:col-span-4' : 'xl:col-span-12'}>
                        <Panel id="news-holdings" aria-labelledby="news-holdings-heading">
                            <SectionHeading id="news-holdings-heading">{NEWS_COPY.holdingsHeading}</SectionHeading>
                            <p className="mb-4 text-xs leading-relaxed text-fg-muted">{NEWS_COPY.holdingsNote}</p>
                            <div className="space-y-2">
                                {view.holdings.map((article) => {
                                    const badge = eventBadge(article.eventType);
                                    return (
                                        <ArticleRow
                                            key={article.url}
                                            url={article.url}
                                            headline={article.headline}
                                            datetime={article.datetime}
                                            source={article.source}
                                            tag={<span data-symbols={article.symbols.join(',')}><MicroLabel>{article.symbols.join(' · ')}</MicroLabel></span>}
                                            chips={badge ? <Term k={badge.term} className="no-underline"><Badge>{badge.label}</Badge></Term> : undefined}
                                        />
                                    );
                                })}
                            </div>
                            <WhatTheseMean keys={eventTermsShown(view.holdings.map((h) => h.eventType))}/>
                        </Panel>
                    </aside>
                )}
            </div>

            {nothing && (
                <Panel pad={8} className="text-center">
                    <span className="material-symbols-outlined text-3xl text-fg-muted">feed</span>
                    <p className="mt-2 text-sm text-fg-muted">{NEWS_COPY.empty}</p>
                </Panel>
            )}
        </div>
    );
};

export default NewsPage;
