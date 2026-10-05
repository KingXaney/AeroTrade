// Every fixed sentence the emails print: the frame's footer, the daily brief's labels, the
// welcome and the password reset. What the model writes for the brief is never here — it is
// rendered as text under these labels (lib/email/digest-render.ts). Held to the 'copy' tier of
// lib/learn/banned.ts by email-copy.test.ts, and every figure comes from a constant the app uses.

import {SITE_NAME} from "@/lib/site";
import {PAPER_STARTING_BALANCE} from "@/lib/trading/starting-balance";
import type {SuggestionAction} from "@/lib/navigator/types";

const dollars = (amount: number): string => `$${amount.toLocaleString('en-US')}`;

// A header must be one line: a model-written headline goes through this before it joins a subject.
export const oneLine = (text: string, max: number): string => {
    const flat = String(text ?? '').replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim();
    return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
};

export const SUBJECT_MAX = 110;

export const EMAIL_FOOTER_COPY = {
    openApp: `Open ${SITE_NAME}`,
    preferences: 'Email preferences',
    allNews: 'All news',
    digestWhy: `You get this email because the daily brief is on in your ${SITE_NAME} settings.`,
    accountWhy: `You get this email because of activity on your ${SITE_NAME} account.`,
    paperNote: `${SITE_NAME} is paper trading: practice money, real market data, no advice.`,
    copyright: `© ${SITE_NAME}`,
} as const;

export type DigestSectionKey = 'mine' | 'markets' | 'feed' | 'filings' | 'social';

// What the AI Navigator did with a holding, in the past tense: a record, not an instruction.
const DIGEST_NAVIGATOR_VERB = (action: SuggestionAction, executed: boolean): string =>
    action === 'hold' ? 'Kept' : action === 'buy' ? (executed ? 'Bought' : 'Planned to buy') : (executed ? 'Sold' : 'Planned to sell');

export const DIGEST_COPY = {
    title: `${SITE_NAME} daily brief`,
    kicker: 'Daily brief',
    inBrief: 'In 30 seconds',
    sections: {
        mine: 'Your stocks',
        markets: 'Markets',
        feed: 'From your news feed',
        filings: 'Filings',
        social: 'What people are posting',
    } satisfies Record<DigestSectionKey, string>,
    sectionNotes: {
        filings: 'Forms companies filed with the SEC. Each filing has the details.',
        social: 'Posts from Reddit communities: what people are saying, not checked news.',
    } as Partial<Record<DigestSectionKey, string>>,
    why: 'Why it matters',
    readMore: 'Read more',
    allNews: `All of today’s news on ${SITE_NAME}`,
    fallbackHeadline: 'Today’s top stories',
    fallbackNote: 'The written summary was not available today, so these are the stories in their outlets’ own words.',
    preheader: (date: string): string => `The news behind your stocks and topics, ${date}.`,
    subject: (shortDate: string, headline: string): string => {
        const lead = `${SITE_NAME} daily brief · ${shortDate}`;
        const line = oneLine(headline, SUBJECT_MAX);
        return line ? oneLine(`${lead}: ${line}`, SUBJECT_MAX) : lead;
    },
    topics: {
        heading: 'Your topics',
        manage: 'Manage topics',
        newCount: (count: number): string => count === 0 ? 'Nothing new since yesterday' : `${count} new since yesterday`,
    },
    navigator: {
        heading: 'AI Navigator',
        caveat: 'An automated paper-trading experiment that follows its own rules. This is a record of what it did, not advice.',
        decided: (date: string): string => `Its decisions dated ${date}:`,
        // One decision's line: "Bought, toward 12% of the account"; a sale to nothing is the whole position.
        row: (action: SuggestionAction, executed: boolean, pct: number): string =>
            action === 'sell' && pct === 0
                ? `${DIGEST_NAVIGATOR_VERB(action, executed)} the whole position`
                : `${DIGEST_NAVIGATOR_VERB(action, executed)}, toward ${pct}% of the account`,
        themes: 'Themes the news brain is following',
        link: 'Every decision, with its reasons',
    },
    // The plain-text part's own words.
    text: {
        rule: '----------------------------------------',
        storyLink: (outlet: string, url: string): string => `  ${outlet}: ${url}`,
    },
} as const;

export const WELCOME_EMAIL_COPY = {
    subject: `Welcome to ${SITE_NAME}: your trading terminal is ready`,
    title: `Welcome to ${SITE_NAME}`,
    preheader: 'Your practice accounts, topics and daily brief are ready.',
    hero: (name: string): string => `Welcome aboard, ${name}`,
    fallbackIntro: `Thanks for joining ${SITE_NAME}. Your practice accounts, topics and daily brief are ready.`,
    featuresLead: 'Here is what you can do right away:',
    features: [
        `Paper-trade with ${dollars(PAPER_STARTING_BALANCE)} of practice money, and see each account next to the S&P 500.`,
        'Follow the topics you care about, such as rate decisions, AI chips or oil, and read a short brief on what changed.',
        'Ask the news brain what the market is paying attention to, and learn what every number on the screen means.',
    ],
    digestNote: 'Your daily brief arrives around noon ET with the news behind your watchlist and topics.',
    cta: `Open ${SITE_NAME}`,
    text: (url: string): string => `Thanks for joining ${SITE_NAME}. Your practice accounts, topics and daily brief are ready: ${url}`,
} as const;

export const RESET_EMAIL_COPY = {
    subject: `Reset your ${SITE_NAME} password`,
    title: `Reset your ${SITE_NAME} password`,
    hero: 'Reset your password',
    preheader: (minutes: number): string => `The link works for ${minutes} minutes.`,
    body: (name: string, minutes: number): string =>
        `Hi ${name}, someone asked to reset the password for this ${SITE_NAME} account. If that was you, choose a new one with the button below: the link works for ${minutes} minutes.`,
    button: 'Choose a new password',
    pasteLead: 'Or paste this link into your browser:',
    notYou: 'If you did not ask for this, you can ignore this email. Your password stays as it is, and nobody can use this link without your inbox.',
    text: (url: string, minutes: number): string =>
        `Reset your ${SITE_NAME} password: ${url}\n\nThe link expires in ${minutes} minutes. If you did not ask for this, ignore this email: your password stays as it is.`,
} as const;
