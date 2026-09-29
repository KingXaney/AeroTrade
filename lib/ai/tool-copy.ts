// The chat tools' descriptions, kept apart from lib/ai/tools.ts (which imports server
// actions) so a unit test can hold every one of them to the no-advice voice without
// touching the database. The Record type makes a tool without copy a type error.

export const TOOL_DESCRIPTIONS: Record<ChatToolName, string> = {
    searchStock: 'Search for stocks by company name or ticker symbol. Use this when the user mentions a company or symbol you want to confirm exists. Returns up to 25 matches with isInWatchlist flags.',
    getStockQuote: 'Get the current price and percent change for a single stock symbol. Always use this before quoting any price number.',
    getStockProfile: 'Get a company profile (name, market capitalization). Use to identify a company by symbol and fetch its market cap.',
    getStockFinancials: 'Get P/E ratios for a stock. Use when the user asks what a P/E is or how a company is priced relative to its earnings. Describe what the ratio measures; never call a stock over- or undervalued.',
    getWatchlist: "List the stocks currently in the user's watchlist. Returns symbol, company name, and when it was added.",
    addStockToWatchlist: 'Add a stock to the watchlist. Idempotent — safe to call even if the stock is already there.',
    removeStockFromWatchlist: 'Remove a stock from the watchlist.',
    getMarketNews: 'Fetch recent market news. Pass specific symbols to get company-specific news, or leave empty for general market news.',
    getBrainDigest: 'Read the news brain: the strongest current market narratives (tickers, sectors, themes) with persistent-attention weight, sentiment and whether each is an active long-term thesis. Use when the user asks what the market cares about, which themes are building, or what the AI is watching.',
    getAiSuggestions: "Fetch the AI Navigator's latest weekly portfolio decisions: the global model portfolio plus this user's own executed decisions if they are enrolled. Use when the user asks what the AI holds or traded. Always present these as an automated paper-trading experiment, never as financial advice.",
    getPaperPortfolio: "Read the user's paper-trading accounts: cash, open positions with unrealised P&L, total value and return since inception, and optionally their recent trades. Call this before answering anything about what they hold, how they're doing, or what a sale would realize — positions change, so never answer from memory or from earlier in the conversation. Read-only: you cannot place orders.",
    getFollowedTopics: "List the news topics the user follows (markets or anything else) with how many articles are new since they last looked, the latest headline and today's AI brief when one exists. Call this first for \"what's new\", \"my topics\", or before reading a topic's feed.",
    getTopicFeed: 'Read the newest articles matched to one followed topic. Pass the topic name or slug the way the user said it.',
    followTopic: 'Follow a new news topic for the user — any subject works ("Fed rate decisions", "NBA trade deadline", "AI chips"). Keywords are optional: leave them out unless the user named specific terms to match.',
    unfollowTopic: "Stop following one of the user's topics. Its matched articles disappear from their feed.",
    explainTerm: 'Look up the app\'s own definition of a term, metric or news concept ("max drawdown", "win rate", "FOMC"), or decode a reason a quant strategy wrote on a fill or board row, clause by clause. For cash, income, win rate, realized P&L, total return and max drawdown it also returns the learner\'s own paper figure for each account. Call it before defining anything, passing the term, or the reason exactly as quoted. It returns entry: null when the app has no entry.',
};
