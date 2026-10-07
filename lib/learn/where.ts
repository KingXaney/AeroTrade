// Where each glossary entry can be seen on the learner's own screen. The /learn index
// links every definition to the page that shows the number, so a term is never read
// in the abstract when the app can show the real one.

import {GLOSSARY, GLOSSARY_KEYS, type GlossaryEntry, type GlossaryKey} from "@/lib/learn/glossary";

export type Home = {href: string; label: string};

const BOARD: readonly GlossaryKey[] = [
    'close', 'since-entry', 'weight', 'target', 'drift', 'sma50', 'sma200', 'sma5', 'spread', 'trend-on',
    'r12', 'above-hurdle', 'pick', 'momentum-12-1', 'momentum-rank', 'rsi2', 'above-sma200',
    'high55', 'low20', 'vs-high', 'vol63', 'vol-rank', 'simulated-record',
    // Time in the market lives on a strategy page (buy-and-hold SPY), so it homes with them.
    'lump-sum', 'dollar-cost-averaging', 'cash-only', 'underwater',
];
const MARKET: readonly GlossaryKey[] = ['market-cap', 'pe-ratio', 'dividend-yield', 'beta', 'fifty-two-week-range'];
const GAMES: readonly GlossaryKey[] = ['kelly-criterion', 'fair-value', 'bid-ask-spread', 'adverse-selection', 'correlation'];
const POKER: readonly GlossaryKey[] = [
    'hand-equity', 'hand-range', 'combination', 'hand-class', 'card-removal', 'exact-enumeration', 'monte-carlo', 'standard-error',
    'pot-odds', 'minimum-defense-frequency', 'expected-value', 'big-blind', 'ante', 'effective-stack', 'push-fold',
    'nash-equilibrium', 'mixed-strategy', 'cfr', 'exploitability',
    'bluff-catcher', 'polarized-range', 'game-tree', 'showdown', 'value-bet', 'bluff',
];
// The landing page's terrain: seen signed out at "/", and at /welcome once signed in.
const LANDING: readonly GlossaryKey[] = ['normalized-momentum', 'lookback'];
const BRAIN: readonly GlossaryKey[] = [
    'news-weight', 'news-sentiment', 'thesis', 'since-thesis',
    'event-earnings', 'event-guidance', 'event-mna', 'event-product', 'event-macro', 'event-regulatory', 'event-analyst', 'event-legal',
];
const CULTURE: readonly GlossaryKey[] = [
    'attention', 'attention-anomaly', 'attention-trend', 'attention-persistence', 'quiet-attention', 'category-share',
    'attention-since-report', 'app-rank', 'brand-sentiment', 'brand-thesis', 'brand-owner', 'picker-profile',
    'signal-adoption', 'signal-hype', 'signal-backlash', 'signal-substitution', 'signal-drop', 'signal-price', 'signal-fading',
    'attention-backtest',
];

const HOMES = {
    board: {href: '/strategies', label: 'Strategy boards'},
    portfolio: {href: '/portfolio', label: 'Your portfolio'},
    market: {href: '/watchlist', label: 'Watchlist and stock pages'},
    concepts: {href: '/topics', label: 'Your topics'},
    brain: {href: '/brain', label: 'The News Brain'},
    rails: {href: '/brain', label: 'The News Brain'},
    culture: {href: '/culture', label: 'The Culture Brain'},
    games: {href: '/games', label: 'The games'},
    poker: {href: '/poker', label: 'The poker solver'},
    landing: {href: '/welcome', label: 'The front door'},
} as const;

type GroupId = keyof typeof HOMES;

export const groupOf = (entry: GlossaryEntry): GroupId => {
    if (entry.kind === 'concept') return 'concepts';
    if (entry.kind === 'rail') return 'rails';
    if ((BOARD as readonly string[]).includes(entry.key)) return 'board';
    if ((MARKET as readonly string[]).includes(entry.key)) return 'market';
    if ((BRAIN as readonly string[]).includes(entry.key)) return 'brain';
    if ((CULTURE as readonly string[]).includes(entry.key)) return 'culture';
    if ((GAMES as readonly string[]).includes(entry.key)) return 'games';
    if ((POKER as readonly string[]).includes(entry.key)) return 'poker';
    if ((LANDING as readonly string[]).includes(entry.key)) return 'landing';
    return 'portfolio';
};

type GlossaryGroup = {id: GroupId; label: string; home: Home; keys: GlossaryKey[]};

const GROUP_LABELS: Record<GroupId, string> = {
    board: 'On a strategy board',
    portfolio: 'On your portfolio',
    market: 'On the watchlist and stock pages',
    concepts: 'Terms in the news',
    brain: 'On the News Brain',
    rails: "The Navigator's rails",
    culture: 'On the Culture Brain',
    games: 'In the games',
    poker: 'In the poker solver',
    landing: 'On the front door',
};

// Registry order within each group, groups in reading order.
export const GLOSSARY_GROUPS: readonly GlossaryGroup[] = (['board', 'portfolio', 'market', 'concepts', 'brain', 'rails', 'culture', 'games', 'poker', 'landing'] as const).map((id) => ({
    id,
    label: GROUP_LABELS[id],
    home: HOMES[id],
    keys: GLOSSARY_KEYS.filter((key) => groupOf(GLOSSARY[key]) === id),
}));
