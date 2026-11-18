// Every stored model, sorted once: does it hold a reader's own data, and under which field?
// Import-free. Deleting an account (lib/account/delete-store.ts) walks USER_DATA in this order,
// and lib/account/__tests__/user-data.test.ts fails when a model file is in neither list — so a
// collection added later cannot be left behind by a deletion without someone deciding so here.

// In deletion order: whatever trades in the reader's accounts first, so nothing fills mid-way;
// then the books; then everything else that is theirs.
export const USER_DATA = {
    'ai-navigator': ['userId'],
    'culture-follow': ['userId'],
    'culture-follow-decision': ['userId'],
    'broker-link': ['userId'],
    'paper-trade': ['userId'],
    'account-snapshot': ['userId'],
    'account-income': ['userId'],
    'paper-account': ['userId'],
    'suggestion-set': ['userId'],
    'topic': ['userId'],
    'watchlist': ['userId'],
    'friendship': ['requesterId', 'addresseeId'],
    'digest-send': ['userId'],
    'game-round': ['userId'],
    'puzzle-solve': ['userId'],
    'arithmetic-skill': ['userId'],
    'lab-event': ['userId'],
    'lab-card-state': ['userId'],
    'poker-result': ['userId'],
    'user-preferences': ['userId'],
} as const satisfies Record<string, readonly string[]>;

export type UserDataModel = keyof typeof USER_DATA;

// Not a reader's own rows, and why — one line each, so the decision is on record.
export const NOT_USER_DATA: Readonly<Record<string, string>> = {
    'agent-world-run': 'the trading agent world is the system\'s own (system:agent-world)',
    'agent-world-session': 'the trading agent world is the system\'s own (system:agent-world)',
    'benchmark-snapshot': 'market data',
    'brain-entity': 'the news brain is global',
    'culture-attention': 'the culture brain is global',
    'culture-backtest': 'the culture brain is global',
    'culture-decision': 'a picker\'s own decisions, under system:culture',
    'culture-earnings': 'market data',
    'culture-entity': 'the culture brain is global',
    'culture-item': 'the culture brain is global',
    'culture-state': 'a picker\'s own state, under system:culture',
    'culture-suggestion': 'the culture brain is global',
    'culture-universe': 'market data',
    'job-run': 'a job\'s stamp',
    'lab-day': 'the day\'s papers, the same for every owner',
    'limit-event': 'an outside service\'s refusal',
    'market-briefing': 'the morning briefing is global',
    'navigator-signal-week': 'the Navigator\'s weekly scores are global',
    'news-item': 'the news brain is global',
    'poker-hand': 'a hand names players by a random pid, never an account',
    'poker-room': 'a table is its players\' for a night: it names them by a random pid, keeps a display name, and expires on its own (expiresAt)',
    'price-bar': 'market data',
    'price-quote': 'market data',
    'price-series-meta': 'market data',
    'rate-limit': 'a counter that lapses with its window',
    'second-opinion': 'one shared critique of the global brain',
    'stock-split': 'market data',
    'strategy-backtest': 'the strategies are the system\'s own (system:strategies)',
    'strategy-run': 'the strategies are the system\'s own (system:strategies)',
    'strategy-state': 'the strategies are the system\'s own (system:strategies)',
    'topic-article': 'articles are stored per keyword set, shared by every reader who follows it',
};
