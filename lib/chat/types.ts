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
    | 'getQuantStrategies'
    | 'getCultureBrain';

// The tools over the brains and the strategies: the owner's alone (lib/lab/owner.ts). buildTools
// never hands them to the model for anyone else, and that audience's prompt never names them.
export const OWNER_CHAT_TOOLS = ['getBrainDigest', 'getAiSuggestions', 'getQuantStrategies', 'getCultureBrain'] as const satisfies readonly ChatToolName[];
