// The React key for a topics feed. TopicFeed copies its first page into state so "Load
// more" can append to it, which means a router.refresh() that brings new articles
// ("Refresh now", a keyword edit) would leave the old page on screen. Keyed on the page
// it was handed, the feed remounts when — and only when — that page changes, so a
// refresh that found nothing new keeps whatever "Load more" added.

import {hashId} from "@/lib/text";

type Keyed = {contentHash: number; topicSlug?: string};

// `scope` is the keyword-set hash on a single topic's page: "Load more" reads the topic's
// current set, so a new set must never append under a page from the old one.
export const topicFeedKey = (articles: readonly Keyed[], scope: string | number = ''): string =>
    `${scope}:${hashId(articles.map((a) => (a.topicSlug ? `${a.contentHash}@${a.topicSlug}` : a.contentHash)).join(','))}`;
