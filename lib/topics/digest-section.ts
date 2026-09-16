// Deterministic "Your topics" block for the daily digest email. Nothing here comes
// from a model: names and briefs are user/LLM text and headlines are scraped, so
// every string is escaped and only http(s) URLs become anchors.

import {escapeHtml} from "@/lib/news/sanitize";

export type TopicDigestInput = {
    name: string;
    slug: string;
    brief?: {summary: string; bullets: string[]} | null;
    newCount: number;
    articles: {headline: string; url: string; source: string}[];
};

// Caps keep the digest inside the free-tier token budget of the summary step.
const MAX_TOPICS = 6;
const MAX_ARTICLES = 3;
const MAX_BULLETS = 4;

const HEADING_STYLE = 'margin: 30px 0 15px 0; font-size: 20px; font-weight: 600; color: #f8f9fa; line-height: 1.3;';
const TOPIC_NAME_STYLE = 'margin: 0 0 4px 0; font-size: 18px; font-weight: 600; color: #f8f9fa; line-height: 1.3;';
const META_STYLE = 'margin: 0 0 10px 0; font-size: 13px; line-height: 1.4; color: #8a9ba0;';
const TEXT_STYLE = 'margin: 0 0 10px 0; font-size: 16px; line-height: 1.6; color: #CCDADC;';
const LIST_STYLE = 'margin: 0 0 12px 0; padding: 0 0 0 20px; font-size: 15px; line-height: 1.5; color: #CCDADC;';
const ARTICLE_STYLE = 'margin: 0 0 6px 0; font-size: 15px; line-height: 1.5; color: #CCDADC;';
const LINK_STYLE = 'color: #FDD458; text-decoration: none;';
const FOOTER_STYLE = 'margin: 20px 0 0 0; font-size: 14px; line-height: 1.5; color: #CCDADC;';

const isHttpUrl = (value: string): boolean => {
    try {
        const {protocol} = new URL(value);
        return protocol === 'http:' || protocol === 'https:';
    } catch {
        return false;
    }
};

// A non-http URL (javascript:, data:, a bare path) is shown as text so the digest can
// never carry a clickable non-web target.
const linkOrText = (url: string, label: string): string =>
    isHttpUrl(url)
        ? `<a href="${escapeHtml(url)}" style="${LINK_STYLE}">${escapeHtml(label)}</a>`
        : escapeHtml(label);

const newCountLine = (newCount: number): string => {
    const count = Math.max(0, Math.floor(Number(newCount) || 0));
    return count === 0 ? 'Nothing new since yesterday' : `${count} new since yesterday`;
};

const renderBrief = (brief: TopicDigestInput['brief']): string => {
    if (!brief) return '';
    const summary = String(brief.summary ?? '').trim();
    const bullets = (brief.bullets ?? [])
        .map((bullet) => String(bullet ?? '').trim())
        .filter(Boolean)
        .slice(0, MAX_BULLETS);

    const parts: string[] = [];
    if (summary) {
        parts.push(`<p class="mobile-text dark-text-secondary" style="${TEXT_STYLE}">${escapeHtml(summary)}</p>`);
    }
    if (bullets.length > 0) {
        const items = bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join('');
        parts.push(`<ul style="${LIST_STYLE}">${items}</ul>`);
    }
    return parts.join('');
};

const renderArticles = (articles: TopicDigestInput['articles']): string =>
    (articles ?? [])
        .filter((article) => String(article?.headline ?? '').trim())
        .slice(0, MAX_ARTICLES)
        .map((article) => {
            const headline = String(article.headline).trim();
            const source = String(article.source ?? '').trim();
            const link = linkOrText(String(article.url ?? ''), headline);
            const suffix = source ? ` &middot; ${escapeHtml(source)}` : '';
            return `<p style="${ARTICLE_STYLE}">${link}${suffix}</p>`;
        })
        .join('');

const renderTopic = (topic: TopicDigestInput): string =>
    `<div style="margin: 0 0 24px 0;">` +
    `<h3 class="mobile-news-title dark-text" style="${TOPIC_NAME_STYLE}">${escapeHtml(String(topic.name ?? ''))}</h3>` +
    `<p class="mobile-text dark-text-secondary" style="${META_STYLE}">${newCountLine(topic.newCount)}</p>` +
    renderBrief(topic.brief) +
    renderArticles(topic.articles) +
    `</div>`;

export const buildTopicsSectionHtml = (topics: TopicDigestInput[], manageUrl: string): string => {
    const shown = (topics ?? []).filter((topic) => String(topic?.name ?? '').trim()).slice(0, MAX_TOPICS);
    if (shown.length === 0) return '';

    const header = `<h2 class="mobile-news-title dark-text" style="${HEADING_STYLE}">&#128204; Your topics</h2>`;
    const body = shown.map(renderTopic).join('');
    const footer = `<p style="${FOOTER_STYLE}">${linkOrText(String(manageUrl ?? ''), 'Manage topics')}</p>`;
    return header + body + footer;
};
