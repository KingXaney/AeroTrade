// Module 4 of the beginner course: reading the news. See lib/learn/copy/course/market.ts for
// the rules every lesson's text keeps.

import type {CourseLessonCopy} from "@/lib/learn/course-types";

export const NEWS_MODULE = {
    id: 'news',
    title: 'Reading the news',
    summary: 'What kind of news a headline is, why rates draw so many, and how coverage becomes a narrative.',
} as const;

export const NEWS_LESSONS: readonly CourseLessonCopy[] = [
    {
        id: 'kinds-of-news',
        title: 'Kinds of news',
        intro: [
            'Not every headline is the same kind of thing: a profit report, a forecast, a merger and a central-bank decision each matter in a different way.',
            'The news brain gives each article it reads one of a few labels.',
            'The label says what sort of news it is, never whether it is welcome.',
        ],
        terms: ['event-earnings', 'event-guidance', 'event-macro', 'event-analyst'],
        tryIt: {label: 'Open the News Brain', href: '/brain'},
        check: {
            question: 'A company says it expects lower sales next quarter. Which kind of event is that?',
            options: ['Guidance', 'Earnings', 'M&A'],
            answer: 0,
            explain: 'A report of results already in is earnings; the company\'s own forecast of what comes next is guidance.',
        },
    },
    {
        id: 'the-fed-and-rates',
        title: 'The Fed and rates',
        intro: [
            'The Federal Reserve steers the cost of borrowing overnight, and almost every other interest rate follows it.',
            'Its committee meets eight times a year, which is why a handful of dates on the calendar draw so many headlines.',
            'The same rate is behind the interest your idle paper cash earns.',
        ],
        terms: ['fomc', 'fed funds rate', 'rate cut', 'rate hike'],
        tryIt: {label: 'Open your topics', href: '/topics'},
        doneFrom: 'topicOpened',
        check: {
            question: 'What does the Fed\'s committee decide at its meetings?',
            options: ['The target for a key interest rate', 'Which stocks join the S&P 500', 'Company tax rates'],
            answer: 0,
            explain: 'It sets a target range for one overnight rate, and other borrowing costs follow.',
        },
    },
    {
        id: 'todays-briefing',
        title: 'Today\'s briefing',
        intro: [
            'Hundreds of articles appear each day, and most repeat one another.',
            'Each morning the app condenses the most important of them into a few points, and every point links to the articles it was drawn from.',
            'A model writes it, so it carries a caveat, and the linked articles are there to check it against.',
        ],
        terms: ['earnings season', 'market rally'],
        tryIt: {label: 'Open the news', href: '/news'},
        check: {
            question: 'Where does a point in the briefing come from?',
            options: ['Articles the app read that morning, linked beside it', 'A forecast of tomorrow\'s prices', 'Other people\'s trades'],
            answer: 0,
            explain: 'Each point cites the articles it summarises. Nothing in it is a forecast.',
        },
    },
    {
        id: 'from-headlines-to-a-thesis',
        title: 'From headlines to a thesis',
        intro: [
            'One headline is a moment; the same subject returning week after week is a narrative.',
            'The news brain keeps two tallies for every company, sector and theme: one that fades in days and one that fades over months.',
            'A subject whose slower tally stays high is the kind the AI Navigator is allowed to act on, inside fixed limits.',
        ],
        terms: ['news-weight', 'news-sentiment', 'thesis'],
        tryIt: {label: 'Open the News Brain', href: '/brain'},
        check: {
            question: 'Which of these is more likely to become a thesis?',
            options: ['A subject covered steadily for weeks', 'A single viral headline', 'A stock with a high price'],
            answer: 0,
            explain: 'Lasting attention is what counts: the slower tally only stays high while coverage keeps coming.',
        },
    },
];
