// The five first-week missions: what to do, where, and the 60-second lesson that
// goes with it. Every sentence is shown to readers as written and is held to the
// no-advice list by lib/learn/__tests__/missions.test.ts. Rails are interpolated from
// the Navigator's own constants so the copy cannot drift from the code.

import {HARD_STOP_DRAWDOWN, MAX_POSITION_WEIGHT, MIN_CASH_WEIGHT} from "@/lib/navigator/config";

const pct = (fraction: number): string => `${Math.round(fraction * 100)}%`;

export type MissionId = 'first-trade' | 'follow-strategy' | 'open-topic' | 'watch-symbol' | 'enrol-navigator';

export type MissionCopy = {
    id: MissionId;
    title: string;
    href: string;
    lesson: readonly string[];
};

export const MISSION_COPY: readonly MissionCopy[] = [
    {
        id: 'first-trade',
        title: 'Place your first paper trade',
        href: '/trade?symbol=SPY',
        lesson: [
            'The order ticket shows Buying Power (the cash you can spend), the Last Price, and an Est. Cost of shares × price.',
            'A paper order fills at once, at the last quote, in whole shares; a real broker fills at the next price available.',
            'SPY is the fund every strategy here is measured against, which makes it a plain first order to read.',
        ],
    },
    {
        id: 'follow-strategy',
        title: 'Follow a quant strategy',
        href: '/strategies',
        lesson: [
            'Eight rule-based strategies trade their own paper accounts every trading morning, with no AI involved.',
            'Each page states the rule in one line, shows what it is watching, and lists every fill with the reason the rule gave.',
            'A followed strategy is pinned at the top of the Quant Strategies widget; its live record is measured against SPY over the same days.',
        ],
    },
    {
        id: 'open-topic',
        title: 'Open one of your topics',
        href: '/topics',
        lesson: [
            'Six topics came preinstalled; each one collects articles that match its keywords.',
            'Opening a topic marks its articles as seen, and a short daily brief says what changed since yesterday.',
            'Topics are not limited to markets — anything with news can be one.',
        ],
    },
    {
        id: 'watch-symbol',
        title: 'Add a stock to your watchlist',
        href: '/watchlist',
        lesson: [
            'A watchlist tracks quotes without owning anything: the price, the day\'s change, the market cap and the P/E ratio.',
            'Market cap is what the whole company trades for; P/E is the price relative to a year of earnings.',
            'Holdings are what an account owns; a watchlist is what you keep an eye on.',
        ],
    },
    {
        id: 'enrol-navigator',
        title: 'Enrol the AI Navigator',
        href: '/brain',
        lesson: [
            'The Navigator is a separate paper account, re-decided once a week from the news brain\'s theses.',
            `It trades inside fixed rails: at most ${pct(MAX_POSITION_WEIGHT)} of the account in one name, at least ${pct(MIN_CASH_WEIGHT)} in cash, and an exit at ${pct(HARD_STOP_DRAWDOWN)} below what it paid.`,
            'Its return against SPY is on the leaderboard for anyone to read. Paper money, an experiment — not advice.',
        ],
    },
];

export const MISSIONS_FOOTER = (done: number, total: number): string =>
    `${done}/${total} done · this panel leaves on its own when they are`;

export const MISSIONS_LESSON_LABEL = '60-second lesson';
export const MISSIONS_HIDE_LABEL = 'Hide';
export const MISSIONS_HIDING = 'Hiding…';
export const MISSIONS_HIDE_FAILED = 'Could not hide the checklist';
