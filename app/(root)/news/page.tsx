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
import ArticleCard from "@/components/news/ArticleCard";
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

const GRID = 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4';

// The news, processed: the morning briefing first, then the reader's topics, then what names
// a symbol they hold or watch, then a few top stories — the rest one click away. It used to be
// twenty-four equal cards in fetch order. The sections and their rules are lib/news/page.ts.
const NewsPage = async ({searchParams}: NewsPageProps) => {
    const userId = await requireUserId();

    const {edit} = await searchParams;
    const prefs = await getNewsFeedPrefs(userId);
    const view = await getNewsPageView(userId, prefs);
    const nothing = !view.briefing && view.topics.length === 0 && view.holdings.length === 0 && view.lead.length === 0;

    return (
        <div className="space-y-4">
            <PageTitle title="News" subtitle={<span id="news-feed-summary">{describeNewsFeed(prefs)}</span>} />
            <NewsSeenMarker />

            <NewsFeedEditor initial={prefs} startOpen={edit === '1'} />

            {view.fallback && (
                <p role="status" className="px-1 text-xs text-warning">{NEWS_COPY.fallback}</p>
            )}

            {view.briefing && (
                <Panel id="news-briefing" aria-labelledby="news-briefing-heading">
                    <NewsBriefing briefing={view.briefing}/>
                </Panel>
            )}

            {view.topics.length > 0 && (
                <Panel id="news-topics" aria-labelledby="news-topics-heading">
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <SectionHeading id="news-topics-heading" spacing="none">{NEWS_COPY.topicsHeading}</SectionHeading>
                        <Link href="/topics" className="label-type text-xs text-brand hover:underline">
                            {NEWS_COPY.topicsLink}{view.moreTopics > 0 ? ` · ${NEWS_COPY.moreTopics(view.moreTopics)}` : ''} →
                        </Link>
                    </div>
                    <div className="space-y-6">
                        {view.topics.map((topic) => (
                            <section key={topic.slug} data-news-topic={topic.slug}>
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="size-2 shrink-0 rounded-full" style={{background: topic.color ?? 'var(--brand)'}} aria-hidden="true"/>
                                    <Link href={`/topics/${topic.slug}`} className="font-heading text-base font-semibold text-fg transition-colors hover:text-brand">
                                        {topic.name}
                                    </Link>
                                    {topic.unseenCount > 0 && (
                                        <Badge tone="brand" shape="pill" aria-label={`${formatCapped(topic.unseenCount, UNSEEN_COUNT_CAP)} unseen`}>
                                            {formatCapped(topic.unseenCount, UNSEEN_COUNT_CAP)}
                                        </Badge>
                                    )}
                                </div>
                                {/* The brief is model output: plain text, with the caveat every brief carries. */}
                                {topic.brief && (
                                    <p className="mt-2 max-w-3xl text-sm leading-relaxed text-fg-soft">
                                        {topic.brief.summary}{' '}
                                        <MicroLabel>{NEWS_COPY.briefingCaveat(topic.brief.date)}</MicroLabel>
                                    </p>
                                )}
                                {topic.articles.length > 0 ? (
                                    <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                                        {topic.articles.map((article) => <NewsArticleCard key={article.id} article={article}/>)}
                                    </div>
                                ) : (
                                    <p className="mt-2 text-xs text-fg-muted">{NEWS_COPY.topicQuiet}</p>
                                )}
                            </section>
                        ))}
                    </div>
                </Panel>
            )}

            {view.holdings.length > 0 && (
                <Panel id="news-holdings" aria-labelledby="news-holdings-heading">
                    <SectionHeading id="news-holdings-heading" spacing="sm">{NEWS_COPY.holdingsHeading}</SectionHeading>
                    <p className="mb-4 text-xs text-fg-muted">{NEWS_COPY.holdingsNote}</p>
                    <div className={GRID}>
                        {view.holdings.map((article) => {
                            const badge = eventBadge(article.eventType);
                            return (
                                <ArticleCard
                                    key={article.url}
                                    url={article.url}
                                    headline={article.headline}
                                    datetime={article.datetime}
                                    source={article.source}
                                    tag={<span className="news-tag text-brand" data-symbols={article.symbols.join(',')}>{article.symbols.join(' · ')}</span>}
                                    chips={badge ? <Term k={badge.term} className="no-underline"><Badge>{badge.label}</Badge></Term> : <span/>}
                                />
                            );
                        })}
                    </div>
                    <WhatTheseMean keys={eventTermsShown(view.holdings.map((h) => h.eventType))}/>
                </Panel>
            )}

            {view.lead.length > 0 && (
                <Panel id="news-top" aria-labelledby="news-top-heading">
                    <SectionHeading id="news-top-heading">{NEWS_COPY.topHeading}</SectionHeading>
                    <div className={GRID}>
                        {view.lead.map((article) => <NewsArticleCard key={article.id} article={article}/>)}
                    </div>
                    {view.more.length > 0 && (
                        <Disclosure className="mt-4" id="news-more" summary={NEWS_COPY.moreHeadlines(view.more.length)}>
                            <div className={`${GRID} mt-3`}>
                                {view.more.map((article) => <NewsArticleCard key={article.id} article={article}/>)}
                            </div>
                        </Disclosure>
                    )}
                </Panel>
            )}

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
