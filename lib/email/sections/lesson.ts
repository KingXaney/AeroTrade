// Deterministic "Today's lesson" block for the daily digest email, under the topics block, built
// from the shared email blocks (lib/email/layout.ts).
// Nothing here comes from a model and nothing is new prose: a moment is told in Today's lesson's
// own copy (momentCopy), a concept in the glossary's own lines, so the email and the dashboard
// widget cannot drift apart. Headlines and sources are scraped text, so every string is escaped,
// only http(s) URLs become anchors (linkOrText), and the daily-news step passes the result through
// sanitizeDigestHtml with lessonSectionLinks — exactly the links built here (invariant 4).
//
// Pure: the facts come from lib/learn/facts-store.ts (readLearnFacts in the job), the concept
// from lib/learn/lesson-store.ts, handed in as a loader so it is read only when no moment is
// mailed. Nothing is stamped: "Got it" stays on the widget.

import {escapeHtml, sanitizeDigestHtml} from "@/lib/news/sanitize";
import {card, cardTitle, EMAIL_COLORS, linkOrText, paragraph, paragraphHtml, sectionLabel} from "@/lib/email/layout";
import {GLOSSARY} from "@/lib/learn/glossary";
import type {LearnFacts} from "@/lib/learn/facts";
import {safeArticleUrl, type Lesson, type LessonHeadline} from "@/lib/learn/lesson";
import {deriveMoments, type Moment} from "@/lib/learn/moments";
import {addCalendarDays} from "@/lib/dates";
import {LESSON_COPY, lessonCountLine, lessonLearnHref, momentCopy} from "@/lib/learn/copy/lesson";

// A moment's own copy is two or three sentences; the cap holds if one ever grows.
export const DIGEST_MAX_SENTENCES = 3;
export const DIGEST_MAX_HEADLINES = 3;
// Scraped headlines can run on; the email shows the start of one.
export const DIGEST_MAX_HEADLINE_CHARS = 200;

type LessonSectionInput = {moment: Moment | null; term: Lesson | null};

// The digest goes out from a noon cron. A fill at 09:40 or a 09:35 rebalance is dated today at
// that noon and yesterday at the next, so only a moment dated exactly yesterday is mailed —
// each one once. Otherwise the same order Today's lesson uses (priority, then newest), and a
// moment already marked "Got it" is never mailed.
export const pickDigestMoment = (facts: LearnFacts, today: string): Moment | null => {
    const yesterday = addCalendarDays(today, -1);
    return deriveMoments(facts, today).find((moment) => moment.occurredOn === yesterday) ?? null;
};

const baseUrl = (appUrl: string): string => String(appUrl ?? '').replace(/\/+$/, '');

const clip = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

const shownHeadlines = (term: Lesson): LessonHeadline[] =>
    term.mode === 'feed'
        ? (term.headlines ?? []).filter((item) => String(item?.headline ?? '').trim()).slice(0, DIGEST_MAX_HEADLINES)
        : [];

const knownTerm = (term: Lesson | null): term is Lesson => term !== null && Object.hasOwn(GLOSSARY, term.key);

const momentHref = (moment: Moment, appUrl: string): string => `${baseUrl(appUrl)}${momentCopy(moment).href}`;
const termHref = (term: Lesson, appUrl: string): string => `${baseUrl(appUrl)}${lessonLearnHref(term.key)}`;

// Exactly the URLs the section links: the one app link, and each shown headline's http(s) URL
// (any other scheme is printed as text by linkOrText, so it is not on the list either).
export const lessonSectionLinks = ({moment, term}: LessonSectionInput, appUrl: string): string[] => {
    if (moment) return [momentHref(moment, appUrl)];
    if (!knownTerm(term)) return [];
    const articles = shownHeadlines(term).map((item) => String(item.url ?? '')).filter((url) => safeArticleUrl(url) !== null);
    return [termHref(term, appUrl), ...articles];
};

// The moment's own numbers, in bold.
const figure = (text: string): string =>
    paragraphHtml(`<strong class="em-ink" style="color: ${EMAIL_COLORS.ink};">${escapeHtml(text)}</strong>`);

const footer = (url: string, label: string): string => paragraphHtml(linkOrText(url, label), 'small');

const renderMoment = (moment: Moment, appUrl: string): string => {
    const copy = momentCopy(moment);
    return [
        paragraph(copy.label, 'small'),
        cardTitle(copy.title),
        figure(copy.figure),
        ...copy.body.slice(0, DIGEST_MAX_SENTENCES).map((sentence) => paragraph(sentence)),
        footer(momentHref(moment, appUrl), copy.linkLabel),
    ].join('');
};

const renderHeadline = (item: LessonHeadline): string => {
    const headline = clip(String(item.headline).trim(), DIGEST_MAX_HEADLINE_CHARS);
    const source = String(item.source ?? '').trim();
    const suffix = source ? ` &middot; ${escapeHtml(source)}` : '';
    return paragraphHtml(`${linkOrText(String(item.url ?? ''), headline)}${suffix}`, 'small');
};

const renderTerm = (term: Lesson, appUrl: string): string => {
    const entry = GLOSSARY[term.key];
    const headlines = shownHeadlines(term);
    return [
        paragraph(term.mode === 'feed' ? LESSON_COPY.feedLabel : LESSON_COPY.dayLabel, 'small'),
        cardTitle(entry.term),
        paragraph(entry.short),
        paragraph(entry.long),
        term.mode === 'feed' ? paragraph(lessonCountLine(term.count), 'small') : '',
        ...headlines.map(renderHeadline),
        footer(termHref(term, appUrl), LESSON_COPY.learnLink),
    ].join('');
};

// '' when there is nothing to teach, so the template's {{lessonSection}} simply disappears.
export const buildLessonSectionHtml = ({moment, term}: LessonSectionInput, appUrl: string): string => {
    const body = moment ? renderMoment(moment, appUrl) : knownTerm(term) ? renderTerm(term, appUrl) : '';
    if (!body) return '';
    return sectionLabel(LESSON_COPY.emailHeading) + card(body);
};

// The whole section for one learner, as the daily-news job mails it: yesterday's moment when
// there is one (the day's term is then never read), otherwise the day's term; built, then
// sanitised to exactly the links it builds. Anything that fails drops the section — '' — and
// never the email. `loadTerm` is the job's read of the day's term (lesson-store).
export const lessonSectionFor = async ({facts, loadTerm, appUrl}: {
    facts: LearnFacts;
    loadTerm: () => Promise<Lesson | null>;
    appUrl: string;
}): Promise<string> => {
    try {
        const moment = pickDigestMoment(facts, facts.today);
        const input: LessonSectionInput = {moment, term: moment ? null : await loadTerm()};
        return sanitizeDigestHtml(buildLessonSectionHtml(input, appUrl), lessonSectionLinks(input, appUrl));
    } catch (error) {
        console.error('Lesson email section failed:', error);
        return '';
    }
};
