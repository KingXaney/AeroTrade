// Output-validation choke point for LLM-generated email HTML. The digest prompt is
// fed attacker-writable text (Reddit titles, RSS descriptions); whatever the model
// emits is injected into the email template verbatim. Two defenses here:
//   1. every <a href> must point at a URL that was actually in the article set
//      (anything else — e.g. an injected phishing link — collapses to its inner text)
//   2. actively dangerous containers (script/style/iframe/object/embed) are removed

import {normalizeUrl} from "@/lib/news/config";

const ANCHOR_PATTERN = /<a\b[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
const DANGEROUS_TAG_PATTERN = /<(script|style|iframe|object|embed)\b[\s\S]*?<\/\1>|<(script|style|iframe|object|embed)\b[^>]*\/?>/gi;

export const sanitizeDigestHtml = (html: string, allowedUrls: string[]): string => {
    const allowed = new Set(allowedUrls.filter(Boolean).map((u) => normalizeUrl(u)));
    return html
        .replace(DANGEROUS_TAG_PATTERN, '')
        .replace(ANCHOR_PATTERN, (match, href: string, inner: string) =>
            allowed.has(normalizeUrl(href)) ? match : inner);
};

// The welcome-email intro is model output written from user-supplied signup fields
// (goals, industry, country) and injected into the template at {{intro}}. It needs
// the same distrust as the digest, but the shape is far narrower: the prompt asks
// for one styled <p> with <strong> emphasis. So rather than filter what the model
// sent, keep only the emphasis and rebuild the wrapper ourselves — an attribute the
// model invented then has nowhere to live.
const ANY_TAG_PATTERN = /<\/?([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>/g;
const INLINE_TAG_ALIASES: Record<string, string> = {strong: 'strong', b: 'strong', em: 'em', i: 'em'};
// Sentinels stand in for approved tags while every other angle bracket is escaped,
// so restoring them cannot reintroduce markup from the original text.
const OPEN_SENTINEL = '';
const CLOSE_SENTINEL = '';
const WELCOME_PARAGRAPH_ATTRS =
    'class="mobile-text" style="margin: 0 0 30px 0; font-size: 16px; line-height: 1.6; color: #CCDADC;"';

export const sanitizeWelcomeIntroHtml = (html: string): string => {
    const withSentinels = (html || '')
        .replace(DANGEROUS_TAG_PATTERN, '')
        .replace(ANY_TAG_PATTERN, (match, tag: string) => {
            const alias = INLINE_TAG_ALIASES[tag.toLowerCase()];
            if (!alias) return '';
            return match.startsWith('</') ? `${CLOSE_SENTINEL}${alias}${CLOSE_SENTINEL}` : `${OPEN_SENTINEL}${alias}${OPEN_SENTINEL}`;
        });

    const escaped = withSentinels
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(new RegExp(`${OPEN_SENTINEL}(\\w+)${OPEN_SENTINEL}`, 'g'), '<$1>')
        .replace(new RegExp(`${CLOSE_SENTINEL}(\\w+)${CLOSE_SENTINEL}`, 'g'), '</$1>')
        .replace(/\s+/g, ' ')
        .trim();

    if (!escaped) return '';
    return `<p ${WELCOME_PARAGRAPH_ATTRS}>${escaped}</p>`;
};
