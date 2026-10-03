// Module 2 of the beginner course: placing a trade. See lib/learn/copy/course/market.ts for
// the rules every lesson's text keeps.

import type {CourseLessonCopy} from "@/lib/learn/course-types";

export const TRADE_MODULE = {
    id: 'trade',
    title: 'Placing a trade',
    summary: 'What an order ticket asks, what a fill changes, and what cash earns while it waits.',
} as const;

export const TRADE_LESSONS: readonly CourseLessonCopy[] = [
    {
        id: 'the-order-ticket',
        title: 'The order ticket',
        intro: [
            'An order ticket asks three things: which symbol, how many shares, and which side of the trade you are on.',
            'It shows the cash you can spend and what the order would cost before you place it.',
            'Nothing here uses real money, so the ticket is a place to see how each field changes the others.',
        ],
        terms: ['buying-power', 'market-order'],
        tryIt: {label: 'Open the order ticket', href: '/trade?symbol=SPY'},
        doneFrom: 'hasUserTrade',
    },
    {
        id: 'what-a-fill-changes',
        title: 'What a fill changes',
        intro: [
            'A fill moves cash into shares: the cash goes down by the cost, and the holdings go up by the same amount.',
            'So the account is worth exactly what it was a moment before; its value changes afterwards, as the price moves.',
            'Until those shares are sold, the gain or loss is on paper only.',
        ],
        terms: ['avg-cost', 'holdings-value', 'net-worth', 'unrealized-pnl'],
        tryIt: {label: 'Open your portfolio', href: '/portfolio'},
    },
    {
        id: 'selling',
        title: 'Selling',
        intro: [
            'A sale turns shares back into cash and makes the gain or loss final.',
            'When the shares were bought at different times, the oldest are counted as sold first.',
            'The trade log pairs each sale with the note you wrote when you bought, so the reason and the result sit together.',
        ],
        terms: ['realized-pnl', 'win-rate', 'hold-time'],
        tryIt: {label: 'Open your activity', href: '/history'},
    },
    {
        id: 'cash-that-earns',
        title: 'Cash that earns',
        intro: [
            'Cash left in an account is not idle: it earns interest every night.',
            'Shares can pay too, when a company sends part of its profit to whoever owned the shares before a set date.',
            'Both arrive as income rows, kept apart from trades, the way a brokerage statement lists them.',
        ],
        terms: ['apy', 't-bill-rate', 'ex-date', 'pay-date', 'income'],
        tryIt: {label: 'Open the income panel', href: '/portfolio#income'},
    },
];
