// Deterministic "Your topics" block for the daily digest email. Nothing here comes
// from a model: names and briefs are user/LLM text and headlines are scraped, so
// every string is escaped and only http(s) URLs become anchors (lib/email/layout.ts).
// Each topic's name links to its own page in the app; topicsSectionLinks is exactly the
// links built here, the allow-list the job sanitizes the section against.

import {escapeHtml} from "@/lib/news/sanitize";
import {card, cardTitle, EMAIL_COLORS, isHttpUrl, linkOrText, paragraph, paragraphHtml, sectionLabel} from "@/lib/email/layout";
import {DIGEST_COPY} from "@/lib/learn/copy/email";
import {DIGEST_ARTICLES_PER_TOPIC, DIGEST_BRIEF_BULLET_CAP, DIGEST_TOPIC_CAP} from "@/lib/topics/config";

export type TopicDigestInput = {
    name: string;
    slug: string;
    brief?: {summary: string; bullets: string[]} | null;
    newCount: number;
    articles: {headline: string; url: string; source: string}[];
};

const LIST_STYLE = `margin: 0 0 10px 0; padding: 0 0 0 18px; font-size: 14px; line-height: 1.55; color: ${EMAIL_COLORS.body};`;

const shownTopics = (topics: readonly TopicDigestInput[]): TopicDigestInput[] =>
    (topics ?? []).filter((topic) => String(topic?.name ?? '').trim()).slice(0, DIGEST_TOPIC_CAP);

const shownArticles = (articles: TopicDigestInput['articles']) =>
    (articles ?? []).filter((article) => String(article?.headline ?? '').trim()).slice(0, DIGEST_ARTICLES_PER_TOPIC);

// A topic's own page, under the manage link's /topics; none when either part is unusable.
const topicUrl = (manageUrl: string, slug: string): string | undefined => {
    const base = String(manageUrl ?? '').replace(/\/+$/, '');
    const id = String(slug ?? '').trim();
    return isHttpUrl(base) && id ? `${base}/${encodeURIComponent(id)}` : undefined;
};

const renderBrief = (brief: TopicDigestInput['brief']): string => {
    if (!brief) return '';
    const summary = String(brief.summary ?? '').trim();
    const bullets = (brief.bullets ?? [])
        .map((bullet) => String(bullet ?? '').trim())
        .filter(Boolean)
        .slice(0, DIGEST_BRIEF_BULLET_CAP);

    const parts: string[] = [];
    if (summary) parts.push(paragraph(summary));
    if (bullets.length > 0) {
        const items = bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join('');
        parts.push(`<ul class="em-body" style="${LIST_STYLE}">${items}</ul>`);
    }
    return parts.join('');
};

const renderArticles = (articles: TopicDigestInput['articles']): string =>
    shownArticles(articles)
        .map((article) => {
            const headline = String(article.headline).trim();
            const source = String(article.source ?? '').trim();
            const suffix = source ? ` &middot; ${escapeHtml(source)}` : '';
            return paragraphHtml(`${linkOrText(String(article.url ?? ''), headline)}${suffix}`, 'small');
        })
        .join('');

const renderTopic = (topic: TopicDigestInput, manageUrl: string): string => card(
    cardTitle(String(topic.name ?? ''), topicUrl(manageUrl, topic.slug)) +
    paragraph(DIGEST_COPY.topics.newCount(Math.max(0, Math.floor(Number(topic.newCount) || 0))), 'small') +
    renderBrief(topic.brief) +
    renderArticles(topic.articles),
);

export const buildTopicsSectionHtml = (topics: TopicDigestInput[], manageUrl: string): string => {
    const shown = shownTopics(topics);
    if (shown.length === 0) return '';
    return sectionLabel(DIGEST_COPY.topics.heading) +
        shown.map((topic) => renderTopic(topic, manageUrl)).join('') +
        paragraphHtml(linkOrText(String(manageUrl ?? ''), DIGEST_COPY.topics.manage), 'small');
};

// Exactly the http(s) links buildTopicsSectionHtml makes: the manage link, each shown topic's
// page and each shown headline.
export const topicsSectionLinks = (topics: TopicDigestInput[], manageUrl: string): string[] => {
    const shown = shownTopics(topics);
    if (shown.length === 0) return [];
    const urls = [
        String(manageUrl ?? ''),
        ...shown.map((topic) => topicUrl(manageUrl, topic.slug) ?? ''),
        ...shown.flatMap((topic) => shownArticles(topic.articles).map((article) => String(article.url ?? ''))),
    ];
    return urls.filter(isHttpUrl);
};
