import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {GLOSSARY} from '@/lib/learn/glossary';
import {CONCEPT_KEYS, type Lesson, type LessonHeadline} from '@/lib/learn/lesson';
import type {LearnFacts} from '@/lib/learn/facts';
import {deriveMoments, type Moment} from '@/lib/learn/moments';
import {momentCopy} from '@/lib/learn/copy/lesson';
import {
    DIGEST_MAX_HEADLINE_CHARS,
    DIGEST_MAX_HEADLINES,
    buildLessonSectionHtml,
    lessonSectionLinks,
    pickDigestMoment,
} from '@/lib/learn/digest-section';
import {sanitizeDigestHtml} from '@/lib/news/sanitize';
import {STRATEGIES} from '@/lib/strategies/catalog';

const APP = 'https://app.example.com';

const headline = (i: number, over: Partial<LessonHeadline> = {}): LessonHeadline => ({
    contentHash: i, headline: `Headline ${i}`, url: `https://news.example.com/story-${i}`, source: 'Wire', datetime: 1_000 - i, ...over,
});

const feedLesson = (headlines: LessonHeadline[], key: Lesson['key'] = 'tariffs'): Lesson => ({mode: 'feed', key, count: headlines.length, headlines});
const dayLesson = (key: Lesson['key'] = 'fomc'): Lesson => ({mode: 'day', key, count: 0, headlines: []});

const fill: Moment = {kind: 'first-fill', id: 'first-fill', occurredOn: '2026-09-29', fill: {date: '2026-09-29', symbol: 'SPY', side: 'buy', quantity: 3, price: 500}};
const sell: Moment = {kind: 'first-sell', id: 'first-sell', occurredOn: '2026-09-29', sell: {date: '2026-09-29', symbol: 'NVDA', quantity: 4, price: 98.5, realizedPnl: -42.18}};
const dividend: Moment = {kind: 'first-dividend', id: 'first-dividend', occurredOn: '2026-09-29',
    dividend: {date: '2026-09-29', symbol: 'SPY', amount: 18.89, perShare: 1.889, quantity: 10, exDate: '2026-09-23'}};
const drawdown: Moment = {kind: 'first-drawdown', id: 'first-drawdown', occurredOn: '2026-09-29',
    drawdown: {date: '2026-09-29', peakDate: '2026-09-23', peakValue: 102_000, value: 96_000, pct: 1 - 96_000 / 102_000}};
const rebalances: Moment[] = STRATEGIES.filter((def) => def.cadence !== 'daily').flatMap((def) => [true, false].map((traded): Moment => ({
    kind: 'rebalance', id: {kind: 'rebalance', strategyId: def.id, date: '2026-09-29'}, occurredOn: '2026-09-29',
    rebalance: {strategyId: def.id, date: '2026-09-29', traded},
})));
const moments: Moment[] = [fill, sell, dividend, drawdown, ...rebalances];

// What a mail client shows: tags gone, the five escapes decoded.
const textOf = (html: string): string => html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&middot;/g, '·')
    .replace(/&#\d+;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
const hrefsOf = (html: string): string[] => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);

describe('buildLessonSectionHtml', () => {
    it('returns an empty string when there is neither a moment nor a term', () => {
        expect(buildLessonSectionHtml({moment: null, term: null}, APP)).toBe('');
        expect(lessonSectionLinks({moment: null, term: null}, APP)).toEqual([]);
    });

    it('returns an empty string for a term the glossary does not know', () => {
        const unknown = {mode: 'day', key: 'not-a-term', count: 0, headlines: []} as unknown as Lesson;
        expect(buildLessonSectionHtml({moment: null, term: unknown}, APP)).toBe('');
        expect(lessonSectionLinks({moment: null, term: unknown}, APP)).toEqual([]);
    });

    it('escapes every string and only links http(s) urls', () => {
        const html = buildLessonSectionHtml({moment: null, term: feedLesson([
            headline(1, {headline: 'Tariffs <script>alert(1)</script> & more', url: 'https://news.example.com/a?x=1&y=2', source: '<b>Wire</b>'}),
            headline(2, {headline: 'Bad link', url: 'javascript:alert(1)'}),
            headline(3, {headline: 'Data link', url: 'data:text/html,<p>x</p>'}),
        ])}, APP);

        expect(html).not.toContain('<script>');
        expect(html).not.toContain('<b>');
        expect(html).toContain('Tariffs &lt;script&gt;alert(1)&lt;/script&gt; &amp; more');
        expect(html).toContain('&lt;b&gt;Wire&lt;/b&gt;');
        expect(html).toContain('href="https://news.example.com/a?x=1&amp;y=2"');
        expect(html).not.toContain('javascript:');
        expect(html).not.toContain('data:text');
        expect(textOf(html)).toContain('Bad link');
        expect(textOf(html)).toContain('Data link');
    });

    it('teaches a moment from its own copy and links to its page in the app', () => {
        const html = buildLessonSectionHtml({moment: sell, term: dayLesson()}, APP);
        const copy = momentCopy(sell);
        const text = textOf(html);
        expect(text).toContain("Today's lesson");
        for (const line of [copy.label, copy.title, copy.figure, ...copy.body]) expect(text).toContain(line);
        // The moment wins over the term: no concept is taught beside it.
        expect(text).not.toContain(GLOSSARY.fomc.term);
        expect(hrefsOf(html)).toEqual([`${APP}/portfolio`]);
        expect(text).toContain(copy.linkLabel);
    });

    it('links a rebalance to its strategy and a dividend to the Income panel', () => {
        const rebalance = rebalances[0];
        if (rebalance.kind !== 'rebalance') throw new Error('fixture');
        expect(hrefsOf(buildLessonSectionHtml({moment: rebalance, term: null}, APP)))
            .toEqual([`${APP}/strategies/${rebalance.rebalance.strategyId}`]);
        expect(hrefsOf(buildLessonSectionHtml({moment: dividend, term: null}, `${APP}/`))).toEqual([`${APP}/portfolio#income`]);
    });

    it('teaches the term of the day with no headlines and a link to its Learn entry', () => {
        const html = buildLessonSectionHtml({moment: null, term: dayLesson('s&p 500')}, APP);
        const text = textOf(html);
        expect(text).toContain(GLOSSARY['s&p 500'].term);
        expect(text).toContain(GLOSSARY['s&p 500'].short);
        expect(text).toContain('Term of the day');
        expect(text).not.toMatch(/articles in your topics used this term/);
        expect(hrefsOf(html)).toEqual([`${APP}/learn#s%26p%20500`]);
    });

    it('teaches a concept from the topics with its count and headlines', () => {
        const html = buildLessonSectionHtml({moment: null, term: feedLesson([headline(1), headline(2)])}, APP);
        const text = textOf(html);
        expect(text).toContain('In your topics today');
        expect(text).toContain('2 of today\'s articles in your topics used this term');
        expect(text).toContain('Headline 1 · Wire');
        // Headlines first, newest first as picked; the Learn link at the foot.
        expect(hrefsOf(html)).toEqual(['https://news.example.com/story-1', 'https://news.example.com/story-2', `${APP}/learn#tariffs`]);
    });

    it('caps headlines and clips a long one', () => {
        const long = 'x'.repeat(DIGEST_MAX_HEADLINE_CHARS + 50);
        const many = [headline(1, {headline: long}), ...Array.from({length: 6}, (_, i) => headline(i + 2))];
        const html = buildLessonSectionHtml({moment: null, term: feedLesson(many)}, APP);
        expect((html.match(/news\.example\.com\/story-\d/g) ?? []).length).toBe(DIGEST_MAX_HEADLINES);
        expect(html).not.toContain(long);
        expect(html).toContain(`${'x'.repeat(DIGEST_MAX_HEADLINE_CHARS - 1)}…`);
        expect(lessonSectionLinks({moment: null, term: feedLesson(many)}, APP)).toHaveLength(1 + DIGEST_MAX_HEADLINES);
    });
});

// The daily-news step passes exactly these links to sanitizeDigestHtml: every anchor the section
// builds survives, and nothing else could.
describe('lessonSectionLinks', () => {
    const inputs = [
        ...moments.map((moment) => ({moment, term: null})),
        {moment: null, term: feedLesson([headline(1), headline(2), headline(3), headline(4)])},
        {moment: null, term: feedLesson([headline(1, {url: 'javascript:alert(1)'}), headline(2)])},
        ...CONCEPT_KEYS.map((key) => ({moment: null, term: dayLesson(key)})),
    ];

    it('lists exactly the links the section carries', () => {
        for (const input of inputs) {
            const html = buildLessonSectionHtml(input, APP);
            const links = lessonSectionLinks(input, APP);
            expect(new Set(hrefsOf(html)), html).toEqual(new Set(links));
            expect(sanitizeDigestHtml(html, links)).toBe(html);
        }
    });

    it('lets the sanitizer drop a link that is not on the list', () => {
        const input = {moment: null, term: feedLesson([headline(1)])};
        const html = buildLessonSectionHtml(input, APP);
        const withoutArticle = sanitizeDigestHtml(html, [`${APP}/learn#tariffs`]);
        expect(hrefsOf(withoutArticle)).toEqual([`${APP}/learn#tariffs`]);
        expect(textOf(withoutArticle)).toContain('Headline 1');
    });
});

describe('the lesson section copy', () => {
    it('describes and never advises, for every moment and every concept', () => {
        const sections = [
            ...moments.map((moment) => buildLessonSectionHtml({moment, term: null}, APP)),
            ...CONCEPT_KEYS.map((key) => buildLessonSectionHtml({moment: null, term: dayLesson(key)}, APP)),
            ...CONCEPT_KEYS.map((key) => buildLessonSectionHtml({moment: null, term: feedLesson([headline(1)], key)}, APP)),
        ];
        for (const html of sections) {
            expect(html).not.toBe('');
            expect(findBanned(textOf(html), 'copy'), textOf(html)).toEqual([]);
        }
    });

    it('never quotes a strategy\'s beginner line', () => {
        for (const moment of rebalances) {
            const text = textOf(buildLessonSectionHtml({moment, term: null}, APP));
            for (const def of STRATEGIES) expect(text.includes(def.explainer.beginnerLine), def.id).toBe(false);
        }
    });
});

// The digest is sent by a noon cron. A fill at 09:40 or a 09:35 rebalance is dated today at
// noon and yesterday at the next noon; only the second may mail it, or it goes out twice.
describe('pickDigestMoment', () => {
    const TODAY = '2026-09-30';
    const YESTERDAY = '2026-09-29';
    const none: LearnFacts = {
        today: TODAY, accountCreatedOn: '2026-09-20', hasUserTrade: false, followedStrategies: [], topicOpened: false,
        hasWatchlist: false, navigatorEnrolled: false, missionsDismissedAt: null,
        firstFill: null, firstSell: null, firstDividend: null, firstDrawdown: null, rebalances: [], lessonsSeen: [],
    };
    const fillOn = (date: string) => ({date, symbol: 'SPY', side: 'buy' as const, quantity: 3, price: 500});

    it('selects nothing when the account has no moment', () => {
        expect(pickDigestMoment(none, TODAY)).toBeNull();
    });

    it('does not select a morning fill or a rebalance that happened today', () => {
        const today: LearnFacts = {
            ...none, hasUserTrade: true, followedStrategies: ['momentum-12-1'],
            firstFill: fillOn(TODAY),
            rebalances: [{strategyId: 'momentum-12-1', date: TODAY, traded: true}],
        };
        // Today's lesson on the dashboard shows both today; the digest waits for tomorrow.
        expect(deriveMoments(today, TODAY).map((m) => m.kind)).toEqual(['first-fill', 'rebalance']);
        expect(pickDigestMoment(today, TODAY)).toBeNull();
        expect(pickDigestMoment(today, '2026-10-01')?.kind).toBe('first-fill');
    });

    it('selects a moment dated exactly yesterday, and nothing older', () => {
        const withFill = (date: string): LearnFacts => ({...none, hasUserTrade: true, firstFill: fillOn(date)});
        expect(pickDigestMoment(withFill(YESTERDAY), TODAY)?.kind).toBe('first-fill');
        expect(pickDigestMoment(withFill('2026-09-28'), TODAY)).toBeNull();
        expect(pickDigestMoment(withFill('2026-09-24'), TODAY)).toBeNull();

        const rebalance: LearnFacts = {...none, followedStrategies: ['sixty-forty'], rebalances: [{strategyId: 'sixty-forty', date: YESTERDAY, traded: false}]};
        expect(pickDigestMoment(rebalance, TODAY)).toMatchObject({kind: 'rebalance', occurredOn: YESTERDAY});
    });

    it('takes yesterday\'s highest-priority moment over an older one and one from today', () => {
        const mixed: LearnFacts = {
            ...none, hasUserTrade: true, followedStrategies: ['momentum-12-1'],
            firstDividend: {date: '2026-09-27', symbol: 'SPY', amount: 5, perShare: 1, quantity: 5, exDate: null},
            firstSell: {date: TODAY, symbol: 'SPY', quantity: 1, price: 510, realizedPnl: 10},
            firstFill: fillOn(YESTERDAY),
            rebalances: [{strategyId: 'momentum-12-1', date: YESTERDAY, traded: true}],
        };
        expect(pickDigestMoment(mixed, TODAY)?.kind).toBe('first-fill');
    });

    it('skips a moment already marked "Got it" and a daily strategy\'s routine check', () => {
        const seen: LearnFacts = {...none, hasUserTrade: true, firstFill: fillOn(YESTERDAY), lessonsSeen: ['first-fill']};
        expect(pickDigestMoment(seen, TODAY)).toBeNull();
        const daily = STRATEGIES.find((def) => def.cadence === 'daily');
        if (!daily) throw new Error('fixture');
        const routine: LearnFacts = {...none, followedStrategies: [daily.id], rebalances: [{strategyId: daily.id, date: YESTERDAY, traded: true}]};
        expect(pickDigestMoment(routine, TODAY)).toBeNull();
    });
});
