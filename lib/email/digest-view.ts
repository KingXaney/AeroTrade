// The daily brief as the email shows it (pure): every label, every link and every line, decided
// here so the HTML and the plain-text renderers (lib/email/digest-render.ts) only lay it out.
//
// What the model wrote (lib/email/digest-summary.ts) is grouped into sections by its cited
// articles, never by anything the model said about itself: a story about one of the reader's own
// symbols is "Your stocks"; otherwise its sources' kind decides — wire and RSS stories are
// Markets, the reader's news feed is its own section, SEC filings and Reddit posts each come
// with a one-line caveat. Ticker chips name only the reader's own symbols, each a link to that
// stock's page in the app. The AI Navigator's decisions are a table built from the stored set —
// the model never sees them, so it cannot restate a number wrongly.
//
// `allowedUrls` is every link the view holds, the allow-list the rendered HTML is sanitized
// against (invariant 4).

import {DIGEST_COPY, EMAIL_FOOTER_COPY, oneLine, type DigestSectionKey} from "@/lib/learn/copy/email";
import {isHttpUrl, type EmailLink} from "@/lib/email/layout";
import type {DigestSource, DigestStory, DigestSummary} from "@/lib/email/digest-summary";
import type {NewsSourceType} from "@/lib/news/types";
import type {SuggestionAction} from "@/lib/navigator/types";

// The reader's latest AI Navigator set, as lib/email/digest.ts reads it.
export type NavigatorDigest = {
    date: string;
    items: {action: SuggestionAction; symbol: string; targetWeightPct: number; executed: boolean}[];
    rationale: string | null;
    activeTheses: string[];
};

export type DigestStoryView = {title: string; summary: string; why: string; chips: EmailLink[]; sources: EmailLink[]};
export type DigestSectionView = {key: DigestSectionKey; label: string; note: string | null; stories: DigestStoryView[]};
export type DigestNavigatorRow = {symbol: EmailLink; action: string};
export type DigestNavigatorView = {
    heading: string;
    caveat: string;
    decided: string;
    rows: DigestNavigatorRow[];
    rationale: string;
    themesLabel: string;
    themes: string[];
    link: EmailLink;
};

export type DigestView = {
    subject: string;
    preheader: string;
    title: string;
    kicker: string;
    dateLine: string;
    headline: string;
    fallbackNote: string | null;
    inBriefLabel: string;
    bullets: {text: string; sources: EmailLink[]}[];
    sections: DigestSectionView[];
    navigator: DigestNavigatorView | null;
    // Built and sanitized by their own modules (lib/email/sections/), against their own links.
    topicsHtml: string;
    lessonHtml: string;
    cta: EmailLink;
    footerLinks: EmailLink[];
    footerLines: string[];
    allowedUrls: string[];
};

export type DigestViewInput = {
    day: string;                 // the ET day it goes out, 'YYYY-MM-DD'
    appUrl: string;
    summary: DigestSummary;
    readerSymbols: readonly string[];
    navigator: NavigatorDigest | null;
    topicsHtml?: string;
    lessonHtml?: string;
};

export const SECTION_ORDER: readonly DigestSectionKey[] = ['mine', 'markets', 'feed', 'filings', 'social'];
export const MAX_CHIPS = 4;
export const MAX_NAVIGATOR_ROWS = 10;
export const MAX_THEMES = 5;
export const RATIONALE_MAX = 400;
const PREHEADER_MAX = 150;
const TICKER = /^[A-Z][A-Z0-9.-]{0,9}$/;

const KIND_SECTION: Record<NewsSourceType, DigestSectionKey> = {
    finance: 'markets',
    rss: 'markets',
    web: 'feed',
    sec: 'filings',
    reddit: 'social',
};

const dayDate = (day: string): Date | null => (/^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T12:00:00Z`) : null);

export const longDate = (day: string): string =>
    dayDate(day)?.toLocaleDateString('en-US', {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC'}) ?? day;

export const shortDate = (day: string): string =>
    dayDate(day)?.toLocaleDateString('en-US', {month: 'short', day: 'numeric', timeZone: 'UTC'}) ?? day;

// The story's section: the reader's own stocks first, else the kind most of its sources share
// (ties go to the earlier section in SECTION_ORDER).
export const sectionOf = (story: Pick<DigestStory, 'sources'>): DigestSectionKey => {
    if (story.sources.some((s) => s.symbols.length > 0)) return 'mine';
    const counts = new Map<DigestSectionKey, number>();
    for (const s of story.sources) {
        const key = KIND_SECTION[s.kind] ?? 'markets';
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    let best: DigestSectionKey = 'markets';
    let bestCount = 0;
    for (const key of SECTION_ORDER) {
        const n = counts.get(key) ?? 0;
        if (n > bestCount) {
            best = key;
            bestCount = n;
        }
    }
    return best;
};

// Markdown the Navigator's rationale may carry, flattened to one plain paragraph.
export const plainText = (markdown: string, max: number): string => {
    const flat = String(markdown ?? '')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, '')
        .replace(/[*_`~]+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
};

export const buildDigestView = ({day, appUrl, summary, readerSymbols, navigator, topicsHtml = '', lessonHtml = ''}: DigestViewInput): DigestView => {
    const base = String(appUrl ?? '').replace(/\/+$/, '');
    const mine = new Set(readerSymbols.map((s) => s.toUpperCase()));
    const stockLink = (symbol: string): EmailLink => ({label: symbol, url: `${base}/stocks/${encodeURIComponent(symbol)}`});
    const sourceLink = (s: DigestSource): EmailLink => ({label: s.source || 'Source', url: s.url});

    const storyView = (story: DigestStory): DigestStoryView => {
        const symbols = [...new Set(story.sources.flatMap((s) => s.symbols))]
            .filter((symbol) => mine.has(symbol) && TICKER.test(symbol))
            .slice(0, MAX_CHIPS);
        return {title: story.title, summary: story.summary, why: story.why, chips: symbols.map(stockLink), sources: story.sources.map(sourceLink)};
    };

    const sections: DigestSectionView[] = SECTION_ORDER
        .map((key): DigestSectionView => ({
            key,
            label: DIGEST_COPY.sections[key],
            note: DIGEST_COPY.sectionNotes[key] ?? null,
            stories: summary.stories.filter((story) => sectionOf(story) === key).map(storyView),
        }))
        .filter((section) => section.stories.length > 0);

    const bullets = summary.bullets.map((point) => ({text: point.text, sources: point.sources.map(sourceLink)}));

    const rows = (navigator?.items ?? [])
        .filter((item) => TICKER.test(String(item.symbol ?? '')))
        .slice(0, MAX_NAVIGATOR_ROWS)
        .map((item): DigestNavigatorRow => ({
            symbol: stockLink(item.symbol),
            action: DIGEST_COPY.navigator.row(item.action, item.executed, Math.round(Number(item.targetWeightPct) || 0)),
        }));
    const navigatorView: DigestNavigatorView | null = navigator && rows.length > 0
        ? {
            heading: DIGEST_COPY.navigator.heading,
            caveat: DIGEST_COPY.navigator.caveat,
            decided: DIGEST_COPY.navigator.decided(longDate(navigator.date)),
            rows,
            rationale: plainText(navigator.rationale ?? '', RATIONALE_MAX),
            themesLabel: DIGEST_COPY.navigator.themes,
            themes: (navigator.activeTheses ?? []).map((t) => oneLine(t, 60)).filter(Boolean).slice(0, MAX_THEMES),
            link: {label: DIGEST_COPY.navigator.link, url: `${base}/brain?view=navigator`},
        }
        : null;

    const headline = summary.headline || DIGEST_COPY.fallbackHeadline;
    const cta: EmailLink = {label: DIGEST_COPY.allNews, url: `${base}/news`};
    const footerLinks: EmailLink[] = [
        {label: EMAIL_FOOTER_COPY.openApp, url: `${base}/`},
        {label: EMAIL_FOOTER_COPY.preferences, url: `${base}/settings#notifications`},
    ];

    const allowedUrls = [
        ...bullets.flatMap((b) => b.sources.map((s) => s.url)),
        ...sections.flatMap((section) => section.stories.flatMap((story) => [...story.sources, ...story.chips].map((l) => l.url))),
        ...(navigatorView ? [...navigatorView.rows.map((r) => r.symbol.url), navigatorView.link.url] : []),
        cta.url,
        ...footerLinks.map((l) => l.url),
    ].filter(isHttpUrl);

    return {
        subject: DIGEST_COPY.subject(shortDate(day), summary.headline),
        preheader: oneLine(bullets[0]?.text || summary.headline || DIGEST_COPY.preheader(longDate(day)), PREHEADER_MAX),
        title: DIGEST_COPY.title,
        kicker: DIGEST_COPY.kicker,
        dateLine: longDate(day),
        headline,
        fallbackNote: summary.fallback ? DIGEST_COPY.fallbackNote : null,
        inBriefLabel: DIGEST_COPY.inBrief,
        bullets,
        sections,
        navigator: navigatorView,
        topicsHtml,
        lessonHtml,
        cta,
        footerLinks,
        footerLines: [EMAIL_FOOTER_COPY.digestWhy, EMAIL_FOOTER_COPY.paperNote, EMAIL_FOOTER_COPY.copyright],
        allowedUrls: [...new Set(allowedUrls)],
    };
};
