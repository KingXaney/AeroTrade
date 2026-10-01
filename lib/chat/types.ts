// Every chat tool's name. The Record<ChatToolName, …> tables (tool copy, chips, labels) must list each one.

export type ChatToolName =
    | 'searchStock'
    | 'getStockQuote'
    | 'getStockProfile'
    | 'getStockFinancials'
    | 'getWatchlist'
    | 'addStockToWatchlist'
    | 'removeStockFromWatchlist'
    | 'getMarketNews'
    | 'getBrainDigest'
    | 'getAiSuggestions'
    | 'getPaperPortfolio'
    | 'getFollowedTopics'
    | 'getTopicFeed'
    | 'followTopic'
    | 'unfollowTopic'
    | 'explainTerm'
    | 'getQuantStrategies';
