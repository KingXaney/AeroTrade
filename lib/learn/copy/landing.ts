// Every sentence on the public landing page (app/(marketing)/welcome/page.tsx) and beside the
// sign-in form (components/auth/AuthShell.tsx). It describes what the app does and promises
// nothing about money: the test holds each line to the 'copy' tier of lib/learn/banned.ts.
//
// Every number is read from the constant the app itself uses, so the page cannot claim eight
// strategies after a ninth is added, and nothing here is a testimonial, a user count or a
// return figure — there is none to quote.

import {GLOSSARY_KEYS} from "@/lib/learn/glossary";
import {COURSE_LESSONS, COURSE_MODULES} from "@/lib/learn/course";
import {STRATEGIES} from "@/lib/strategies/catalog";
import {PALETTE_IDS} from "@/lib/theme/palettes";
import {STYLE_IDS} from "@/lib/theme/styles";
import {DEFAULT_TOPIC_NAMES} from "@/lib/topics/starters";
import {PAPER_STARTING_BALANCE} from "@/lib/trading/starting-balance";

const dollars = (amount: number): string => `$${amount.toLocaleString('en-US')}`;

export type LandingPillar = {
    id: 'news' | 'learn' | 'practise';
    icon: string;       // Material Symbols name
    title: string;
    body: string;
    points: readonly string[];
};

export const LANDING_COPY = {
    metaTitle: 'AeroTrade — keep up with the markets, and learn how they work',
    metaDescription: `Follow finance and technology news by topic, learn what the numbers mean, and practise with ${dollars(PAPER_STARTING_BALANCE)} of paper money. No real money is involved.`,

    signIn: 'Sign in',
    signUp: 'Create a free account',

    eyebrow: 'News, lessons and paper trading in one place',
    title: 'Markets move fast. Keep up, and learn how they work.',
    subtitle: `AeroTrade reads the day's finance and technology news for you, explains what every number means, and gives you ${dollars(PAPER_STARTING_BALANCE)} of paper money to practise with. No real money is involved.`,

    pillarsHeading: 'Three things it does',
    pillars: [
        {
            id: 'news',
            icon: 'feed',
            title: 'Keep up with what is changing',
            body: 'Rates, chips, energy, policy: the stories that move markets change by the hour. Follow any topic and its headlines arrive from every source the app reads, with a short summary each morning of what changed.',
            points: [
                `A new account starts with ${DEFAULT_TOPIC_NAMES.length} topics, among them ${DEFAULT_TOPIC_NAMES.slice(0, 3).join(', ')}.`,
                'Scheduled jobs read finance news, feeds and company filings each day and group them into narratives.',
                'A daily email covers the market, your topics and one lesson.',
            ],
        },
        {
            id: 'learn',
            icon: 'school',
            title: 'Learn how the market works',
            body: 'Start from nothing: what a share is, how an order fills, what a portfolio is made of. Every figure on screen carries its own definition, and the app teaches from your own account as you use it.',
            points: [
                `A beginner course of ${COURSE_LESSONS.length} short lessons, each ending on one question and a link to the real screen.`,
                `One glossary of ${GLOSSARY_KEYS.length} terms, each defined in plain words beside the number it explains.`,
                'One short lesson and one quiz question each day, drawn from that day\'s news and trades.',
            ],
        },
        {
            id: 'practise',
            icon: 'candlestick_chart',
            title: 'Practise with paper money',
            body: `Open paper accounts that start at ${dollars(PAPER_STARTING_BALANCE)}, place orders at the last price, and watch holdings, cash interest and dividends add up the way a brokerage statement shows them.`,
            points: [
                `${STRATEGIES.length} rule-based strategies trade beside you each morning, and every fill states the rule that caused it.`,
                'An AI Navigator trades a paper account from the news inside fixed limits, and writes down why.',
                'Compare accounts with friends, measured against the S&P 500.',
            ],
        },
    ] as const satisfies readonly LandingPillar[],

    stepsHeading: 'How it starts',
    steps: [
        {title: 'Create an account', body: 'A name, an email and a password. A paper account and a first set of topics are ready when you arrive.'},
        {title: 'Follow topics and place a paper trade', body: 'The first-week list shows where each thing is, with a one-minute lesson behind every step.'},
        {title: 'Read what changed each day', body: 'Home shows your accounts, what moved in your topics and one thing to look at next.'},
    ] as const,

    courseHeading: 'What the course covers',
    courseBody: `${COURSE_MODULES.length} modules, a minute or two a lesson. Nothing in it says what to own; it explains how the pieces work.`,
    // The syllabus itself: the course registry's own module and lesson titles.
    course: COURSE_MODULES.map((section) => ({id: section.id, title: section.title, lessons: section.lessons.map((lesson) => lesson.title)})),

    themesHeading: 'Make it look like yours',
    themesBody: `${PALETTE_IDS.length} colour palettes and ${STYLE_IDS.length} visual styles, saved to your account. Try one here.`,

    previewLabel: 'Example screen',
    previewAccount: 'Paper balance',
    previewBriefing: "Today's briefing",
    // Illustrations of the shape of a briefing, not headlines: they name no company and no date.
    previewBullets: [
        'A central bank decision, and what changed in its statement.',
        'An earnings report, with the figure analysts were watching.',
        'A policy announcement, and the sectors it touches.',
    ] as const,
    previewTopics: 'Your topics',

    closingTitle: 'Start with paper money',
    closingBody: 'It takes a minute, and nothing here uses real money.',

    disclaimer: 'AeroTrade is for learning. It describes markets and never gives financial advice. Paper accounts hold no real money.',
    credit: 'Open source · built by Xinnan Huang',
} as const;

// The balance a new account starts with, as the page prints it.
export const LANDING_BALANCE = `${dollars(PAPER_STARTING_BALANCE)}.00`;
