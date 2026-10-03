// Module 1 of the beginner course: how the market works. Lesson text only — the course's
// structure and progress are lib/learn/course.ts. A lesson frames; it never defines: the terms
// it lists are printed from lib/learn/glossary.ts beside it, so its sentences say what those
// definitions do not. The test holds every line to the 'copy' tier of lib/learn/banned.ts.

import type {CourseLessonCopy} from "@/lib/learn/course-types";

export const MARKET_MODULE = {
    id: 'market',
    title: 'How the market works',
    summary: 'What a share is, when it trades, and what an index measures.',
} as const;

export const MARKET_LESSONS: readonly CourseLessonCopy[] = [
    {
        id: 'a-share-and-its-price',
        title: 'A share and its price',
        intro: [
            'A share is one slice of a company; whoever owns it owns that fraction of the business.',
            'Its price is the last amount a buyer and a seller agreed on, so it moves whenever the next pair agrees on something else.',
            'Multiply that price by every share that exists and you have what the market says the whole company is worth today.',
        ],
        terms: ['close', 'market-cap', 'fifty-two-week-range'],
        tryIt: {label: 'Open a stock page', href: '/stocks/SPY'},
    },
    {
        id: 'when-the-market-is-open',
        title: 'When the market is open',
        intro: [
            'US stocks trade on weekdays from 9:30 AM to 4:00 PM Eastern, and not on market holidays.',
            'Outside those hours a quote shows the last close, not a live price.',
            'A paper order placed then still fills at once, at that last quote, which no real exchange would do.',
        ],
        terms: ['market-order', 'close'],
        tryIt: {label: 'Open the trade desk', href: '/trade'},
    },
    {
        id: 'indexes-and-the-benchmark',
        title: 'Indexes and the benchmark',
        intro: [
            'An index is a list of stocks tracked as one number, so a single figure says how a whole part of the market moved.',
            'A fund called SPY owns the 500 large US companies of the most widely followed list, which makes that list something a person can actually own.',
            'Every account here is drawn beside SPY: the question each chart answers is whether the account did more or less than owning the list.',
        ],
        terms: ['s&p 500', 'nasdaq', 'dow jones', 'benchmark', 'vs-spy'],
        tryIt: {label: 'Open the buy-and-hold strategy', href: '/strategies/buy-and-hold-spy'},
    },
    {
        id: 'reading-a-stock-page',
        title: 'Reading a stock page',
        intro: [
            'A stock page sets a company\'s size, its price against its profit, its payouts and its swings side by side.',
            'None of the figures is a verdict; each divides one thing by another, and the page says which.',
            'The same page shows what each rule-based strategy currently sees in that stock, when one of them watches it.',
        ],
        terms: ['pe-ratio', 'dividend-yield', 'beta'],
        tryIt: {label: 'Open the watchlist', href: '/watchlist'},
        doneFrom: 'hasWatchlist',
    },
];
