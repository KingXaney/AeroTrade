// Output-validation choke point for LLM-generated email HTML. The digest prompt is
// fed attacker-writable text (Reddit titles, RSS descriptions); whatever the model
// emits is injected into the email template verbatim. Two defenses here:
//   1. every <a href> must point at a URL that was actually in the article set
//      (anything else — e.g. an injected phishing link — collapses to its inner text)
//   2. actively dangerous containers (script/style/iframe/object/embed) are removed

import {normalizeUrl} from "@/lib/text";

// Match any anchor first, then pull the href out of its attributes. Requiring quotes
// in the anchor pattern itself left a hole: <a href=https://evil.test> matched nothing
// and passed through untouched, which is precisely the phishing link this exists to
// stop. An anchor with no readable href is not on the allowlist either, so it
// collapses to its text.
const ANCHOR_PATTERN = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
// Anchored on a preceding space so `data-href` cannot masquerade as the real
// attribute and hand back an allowlisted decoy while the actual href points elsewhere.
const HREF_PATTERN = /(?:^|\s)href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;
const DANGEROUS_TAG_PATTERN = /<(script|style|iframe|object|embed)\b[\s\S]*?<\/\1>|<(script|style|iframe|object|embed)\b[^>]*\/?>/gi;

export const sanitizeDigestHtml = (html: string, allowedUrls: string[]): string => {
    const allowed = new Set(allowedUrls.filter(Boolean).map((u) => normalizeUrl(u)));
    return html
        .replace(DANGEROUS_TAG_PATTERN, '')
        .replace(ANCHOR_PATTERN, (match, attrs: string, inner: string) => {
            const found = HREF_PATTERN.exec(attrs);
            const href = found ? (found[1] ?? found[2] ?? found[3] ?? '') : '';
            return href && allowed.has(normalizeUrl(href)) ? match : inner;
        });
};

// The welcome-email intro is model output written from user-supplied signup fields
// (goals, industry, country) and placed into the welcome email. It needs the same
// distrust as the digest, but the shape is far narrower: the prompt asks for two
// sentences with <strong> emphasis. So rather than filter what the model sent, keep
// only the emphasis and drop every other tag — an attribute the model invented then
// has nowhere to live. The result is inline HTML; the email's own paragraph block
// (lib/email/layout.paragraphHtml) wraps it.
const ANY_TAG_PATTERN = /<\/?([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>/g;
const INLINE_TAG_ALIASES: Record<string, string> = {strong: 'strong', b: 'strong', em: 'em', i: 'em'};
// Sentinels stand in for approved tags while every other angle bracket is escaped,
// so restoring them cannot reintroduce markup from the original text.
const OPEN_SENTINEL = '\u0001';
const CLOSE_SENTINEL = '\u0002';

// The sentinels below are real characters, so text already containing them could
// survive escaping and be restored as a tag — U+0001script U+0001 would become
// <script>. Strip C0 controls (keeping tab/newline/CR) before anything else.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export const sanitizeWelcomeIntroHtml = (html: string): string => {
    const withSentinels = (html || '')
        .replace(CONTROL_CHARS, '')
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

    return escaped;
};

// Shared by the email templates and the topics digest section. Replacer function
// form so a `$&` in user text can never be interpreted by String.replace.
export const escapeHtml = (value: string): string =>
    value.replace(/[&<>"']/g, (ch) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch] as string));
