// The daily brief, laid out (pure): the HTML on the shared frame (lib/email/layout.ts) and a real
// plain-text part with every link spelled out. Everything the view holds is text, escaped by the
// blocks; the part built here is sanitized against the view's own allow-list before the topics
// and lesson sections — already sanitized against theirs — are added below it.

import {escapeHtml, sanitizeDigestHtml} from "@/lib/news/sanitize";
import {
    bulletList,
    button,
    card,
    cardTitle,
    chips,
    EMAIL_COLORS,
    hero,
    inlineSources,
    keyValueRows,
    leadParagraph,
    linkOrText,
    paragraph,
    paragraphHtml,
    renderEmail,
    sectionLabel,
    sourceLine,
} from "@/lib/email/layout";
import {DIGEST_COPY} from "@/lib/learn/copy/email";
import type {DigestNavigatorView, DigestStoryView, DigestView} from "@/lib/email/digest-view";

const storyCard = (story: DigestStoryView, accent: boolean): string => card(
    chips(story.chips) +
    cardTitle(story.title) +
    (story.summary ? paragraph(story.summary) : '') +
    (story.why ? leadParagraph(DIGEST_COPY.why, story.why) : '') +
    sourceLine(DIGEST_COPY.readMore, story.sources),
    {accent},
);

const navigatorBlock = (nav: DigestNavigatorView): string => sectionLabel(nav.heading) + card(
    paragraph(nav.caveat, 'small') +
    paragraph(nav.decided) +
    keyValueRows(nav.rows.map((row) => ({
        keyHtml: linkOrText(row.symbol.url, row.symbol.label, `color: ${EMAIL_COLORS.ink}; text-decoration: none;`),
        valueHtml: escapeHtml(row.action),
    }))) +
    (nav.rationale ? paragraph(nav.rationale) : '') +
    (nav.themes.length > 0 ? paragraphHtml(`<strong>${escapeHtml(nav.themesLabel)}:</strong> ${escapeHtml(nav.themes.join(', '))}`, 'small') : '') +
    paragraphHtml(`${linkOrText(nav.link.url, nav.link.label)} &rarr;`, 'small'),
);

// The part of the body built from the view (and so from the model's text): sanitized against
// the view's own links.
export const renderDigestBody = (view: DigestView): string => {
    const html = [
        hero(view.headline),
        view.fallbackNote ? paragraph(view.fallbackNote, 'muted') : '',
        view.bullets.length > 0
            ? sectionLabel(view.inBriefLabel) + bulletList(view.bullets.map((b) => escapeHtml(b.text) + inlineSources(b.sources)))
            : '',
        ...view.sections.map((section) =>
            sectionLabel(section.label) +
            (section.note ? paragraph(section.note, 'small') : '') +
            section.stories.map((story) => storyCard(story, section.key === 'mine')).join('')),
        view.navigator ? navigatorBlock(view.navigator) : '',
    ].join('');
    return sanitizeDigestHtml(html, view.allowedUrls);
};

export const renderDigestHtml = (view: DigestView): string => renderEmail({
    title: view.title,
    preheader: view.preheader,
    kicker: view.kicker,
    barLine: view.dateLine,
    bodyHtml: renderDigestBody(view) + view.topicsHtml + view.lessonHtml + button(view.cta.url, view.cta.label),
    footerLinks: view.footerLinks,
    footerLines: view.footerLines,
});

// What a mail client shows of an HTML section: tags gone, links written out after their text.
export const htmlToText = (html: string): string => String(html ?? '')
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, label: string) => `${label} (${href})`)
    .replace(/<\/(p|h1|h2|h3|li|tr|ul|table)>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '- ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&middot;/g, '·').replace(/&rarr;/g, '→').replace(/&nbsp;/g, ' ').replace(/&#8599;/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .split('\n').map((line) => line.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n');

export const renderDigestText = (view: DigestView): string => {
    const lines: string[] = [`${view.title} · ${view.dateLine}`, '', view.headline];
    if (view.fallbackNote) lines.push('', view.fallbackNote);
    if (view.bullets.length > 0) {
        lines.push('', view.inBriefLabel.toUpperCase());
        for (const b of view.bullets) {
            lines.push(`- ${b.text}`, ...b.sources.map((s) => DIGEST_COPY.text.storyLink(s.label, s.url)));
        }
    }
    for (const section of view.sections) {
        lines.push('', section.label.toUpperCase());
        if (section.note) lines.push(section.note);
        for (const story of section.stories) {
            lines.push('', `* ${story.title}`);
            if (story.chips.length > 0) lines.push(`  ${story.chips.map((c) => `${c.label} (${c.url})`).join(', ')}`);
            if (story.summary) lines.push(`  ${story.summary}`);
            if (story.why) lines.push(`  ${DIGEST_COPY.why}: ${story.why}`);
            lines.push(`  ${DIGEST_COPY.readMore}:`, ...story.sources.map((s) => DIGEST_COPY.text.storyLink(s.label, s.url)));
        }
    }
    if (view.navigator) {
        const nav = view.navigator;
        lines.push('', nav.heading.toUpperCase(), nav.caveat, nav.decided, ...nav.rows.map((r) => `- ${r.symbol.label}: ${r.action} (${r.symbol.url})`));
        if (nav.rationale) lines.push(nav.rationale);
        if (nav.themes.length > 0) lines.push(`${nav.themesLabel}: ${nav.themes.join(', ')}`);
        lines.push(`${nav.link.label}: ${nav.link.url}`);
    }
    for (const html of [view.topicsHtml, view.lessonHtml]) {
        const text = htmlToText(html);
        if (text) lines.push('', text);
    }
    lines.push('', `${view.cta.label}: ${view.cta.url}`, DIGEST_COPY.text.rule);
    lines.push(...view.footerLinks.map((l) => `${l.label}: ${l.url}`), ...view.footerLines);
    return lines.join('\n');
};
