// Output-validation choke point for LLM-generated email HTML. The digest prompt is
// fed attacker-writable text (Reddit titles, RSS descriptions); whatever the model
// emits is injected into the email template verbatim. Two defenses here:
//   1. every <a href> must point at a URL that was actually in the article set
//      (anything else — e.g. an injected phishing link — collapses to its inner text)
//   2. actively dangerous containers (script/style/iframe/object/embed) are removed

import {normalizeUrl} from "@/lib/news/aggregate";

const ANCHOR_PATTERN = /<a\b[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
const DANGEROUS_TAG_PATTERN = /<(script|style|iframe|object|embed)\b[\s\S]*?<\/\1>|<(script|style|iframe|object|embed)\b[^>]*\/?>/gi;

export const sanitizeDigestHtml = (html: string, allowedUrls: string[]): string => {
    const allowed = new Set(allowedUrls.filter(Boolean).map((u) => normalizeUrl(u)));
    return html
        .replace(DANGEROUS_TAG_PATTERN, '')
        .replace(ANCHOR_PATTERN, (match, href: string, inner: string) =>
            allowed.has(normalizeUrl(href)) ? match : inner);
};
