// Module 3 of the beginner course: building a portfolio. See lib/learn/copy/course/market.ts
// for the rules every lesson's text keeps. It describes how a portfolio is put together and
// measured; it never says what one ought to hold.

import {STRATEGIES} from "@/lib/strategies/catalog";
import {numberWord} from "@/lib/text";
import type {CourseLessonCopy} from "@/lib/learn/course-types";

export const PORTFOLIO_MODULE = {
    id: 'portfolio',
    title: 'Building a portfolio',
    summary: 'How holdings add up, how a return is judged, and what a rule looks like.',
} as const;

export const PORTFOLIO_LESSONS: readonly CourseLessonCopy[] = [
    {
        id: 'weights-and-concentration',
        title: 'Weights and concentration',
        intro: [
            'A portfolio is everything an account holds, cash included.',
            'When one holding makes up most of it, the whole account moves with that one company\'s news.',
            'Spread across several holdings, a single surprise moves the total less; that does not remove risk, it shares it out.',
        ],
        terms: ['weight', 'concentration', 'effective-holdings'],
        tryIt: {label: 'Open the risk lens', href: '/portfolio'},
        check: {
            question: 'An account holds $8,000 of one stock and $2,000 of cash. What is the stock\'s weight?',
            options: ['20%', '80%', '8%'],
            answer: 1,
            explain: '8,000 of 10,000 is 80%: the account\'s day is mostly that one stock\'s day.',
        },
    },
    {
        id: 'return-against-a-benchmark',
        title: 'Return against a benchmark',
        intro: [
            'A return says how far an account\'s value has moved from where it started, as a percentage.',
            'On its own the number says little: +5% in a year the market rose 20% and +5% in a year it fell are different stories.',
            'That is why every chart here draws SPY beside the account, with interest and dividends counted on both.',
        ],
        terms: ['total-return', 'vs-spy', 'cagr'],
        tryIt: {label: 'Open the performance chart', href: '/portfolio'},
        check: {
            question: 'An account started at $100,000 and is worth $103,000. What is its total return?',
            options: ['+3%', '+103%', '+30%'],
            answer: 0,
            explain: '(103,000 − 100,000) ÷ 100,000 = +3%.',
        },
    },
    {
        id: 'swings-and-drawdowns',
        title: 'Swings and drawdowns',
        intro: [
            'Two accounts can end the year at the same value and feel nothing alike on the way there.',
            'One number describes how much the value moves from day to day; another, how far it fell from its highest point.',
            'Both describe the ride, not the destination, and both come from the account\'s own daily values.',
        ],
        terms: ['volatility', 'daily-swing', 'max-drawdown', 'recovery'],
        tryIt: {label: 'Open your portfolio', href: '/portfolio'},
        check: {
            question: 'An account peaks at $120,000, falls to $90,000, then climbs to $110,000. What was its drawdown at the low?',
            options: ['−25%', '−8%', '−30%'],
            answer: 0,
            explain: 'From the peak to the low: (90,000 − 120,000) ÷ 120,000 = −25%.',
        },
    },
    {
        id: 'a-rule-instead-of-a-hunch',
        title: 'A rule instead of a hunch',
        intro: [
            'A strategy is a rule written down in advance: what to own, how much of each, and when to change it.',
            `The ${numberWord(STRATEGIES.length)} strategies here follow theirs every trading morning with paper money, and each fill states the rule that caused it.`,
            'Reading one shows what a decision looks like when nothing about it depends on a mood.',
        ],
        terms: ['target', 'drift', 'dollar-cost-averaging'],
        tryIt: {label: 'Open the 60/40 strategy', href: '/strategies/sixty-forty'},
        doneFrom: 'followedStrategies',
        check: {
            question: 'A 60/40 rule finds that stocks have grown to 70% of the account. What does its next rebalance do?',
            options: ['Brings stocks back toward 60%', 'Moves everything into stocks', 'Nothing'],
            answer: 0,
            explain: 'The rule\'s split is fixed, so it trades back toward it.',
        },
    },
];
