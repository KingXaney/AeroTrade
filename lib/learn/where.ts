// Where each glossary entry can be seen on the learner's own screen. The /learn index
// links every definition to the page that shows the number, so a term is never read
// in the abstract when the app can show the real one.

import {GLOSSARY, GLOSSARY_KEYS, type GlossaryEntry, type GlossaryKey} from "@/lib/learn/glossary";

export type Home = {href: string; label: string};

const BOARD: readonly GlossaryKey[] = [
    'close', 'since-entry', 'weight', 'target', 'drift', 'sma50', 'sma200', 'sma5', 'spread', 'trend-on',
    'r12', 'above-hurdle', 'pick', 'momentum-12-1', 'momentum-rank', 'rsi2', 'above-sma200',
    'high55', 'low20', 'vs-high', 'vol63', 'vol-rank', 'simulated-record',
];
const MARKET: readonly GlossaryKey[] = ['market-cap', 'pe-ratio', 'dividend-yield', 'beta', 'fifty-two-week-range'];

const HOMES = {
    board: {href: '/strategies', label: 'Strategy boards'},
    portfolio: {href: '/portfolio', label: 'Your portfolio'},
    market: {href: '/watchlist', label: 'Watchlist and stock pages'},
    concepts: {href: '/topics', label: 'Your topics'},
    rails: {href: '/brain', label: 'The News Brain'},
} as const;

export type GroupId = keyof typeof HOMES;

export const groupOf = (entry: GlossaryEntry): GroupId => {
    if (entry.kind === 'concept') return 'concepts';
    if (entry.kind === 'rail') return 'rails';
    if ((BOARD as readonly string[]).includes(entry.key)) return 'board';
    if ((MARKET as readonly string[]).includes(entry.key)) return 'market';
    return 'portfolio';
};

export const whereItLives = (entry: GlossaryEntry): Home => HOMES[groupOf(entry)];

export type GlossaryGroup = {id: GroupId; label: string; home: Home; keys: GlossaryKey[]};

const GROUP_LABELS: Record<GroupId, string> = {
    board: 'On a strategy board',
    portfolio: 'On your portfolio',
    market: 'On the watchlist and stock pages',
    concepts: 'Terms in the news',
    rails: "The Navigator's rails",
};

// Registry order within each group, groups in reading order.
export const GLOSSARY_GROUPS: readonly GlossaryGroup[] = (['board', 'portfolio', 'market', 'concepts', 'rails'] as const).map((id) => ({
    id,
    label: GROUP_LABELS[id],
    home: HOMES[id],
    keys: GLOSSARY_KEYS.filter((key) => groupOf(GLOSSARY[key]) === id),
}));
