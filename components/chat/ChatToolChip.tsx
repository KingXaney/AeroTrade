import {Check, Loader2, AlertCircle, Wrench} from "lucide-react";
import {cn} from "@/lib/utils";

type ToolState = 'input-streaming' | 'input-available' | 'output-available' | 'output-error';

type ChatToolChipProps = {
    toolName: string;
    state: ToolState;
    summary?: string;
};

// Human-friendly labels for each tool; the type keeps this list complete.
const LABELS: Record<ChatToolName, string> = {
    searchStock: 'Searching stocks',
    getStockQuote: 'Fetching quote',
    getStockProfile: 'Fetching company profile',
    getStockFinancials: 'Fetching financials',
    getWatchlist: 'Reading your watchlist',
    addStockToWatchlist: 'Adding to watchlist',
    removeStockFromWatchlist: 'Removing from watchlist',
    getMarketNews: 'Fetching market news',
    getBrainDigest: 'Reading the news brain',
    getAiSuggestions: 'Fetching AI suggestions',
    getPaperPortfolio: 'Reading your portfolio',
    getFollowedTopics: 'Checking your topics',
    getTopicFeed: 'Reading topic news',
    followTopic: 'Following a topic',
    unfollowTopic: 'Unfollowing a topic',
};

const ChatToolChip = ({toolName, state, summary}: ChatToolChipProps) => {
    const label = LABELS[toolName as ChatToolName] || toolName;

    const Icon =
        state === 'output-error' ? AlertCircle :
        state === 'output-available' ? Check :
        state === 'input-available' || state === 'input-streaming' ? Loader2 :
        Wrench;

    return (
        <div
            // Semantic tokens, not Tailwind's own palette: these chips used to be fixed
            // greys, reds and yellows, so on the light palettes they were dark pills glued
            // into a white page and the theme picker silently didn't reach them. A
            // completed call was also rendering yellow — reading as a warning next to a
            // red error rather than as success.
            className={cn(
                'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs',
                state === 'output-error'
                    ? 'border-negative/40 bg-negative/10 text-negative'
                    : state === 'output-available'
                        ? 'border-positive/40 bg-positive/10 text-positive'
                        : 'border-line-strong/40 bg-surface-3/60 text-fg-soft',
            )}
        >
            <Icon
                className={cn(
                    'size-3.5',
                    (state === 'input-available' || state === 'input-streaming') && 'animate-spin',
                )}
            />
            <span className="font-medium">{label}</span>
            {summary && <span className="text-fg-muted">— {summary}</span>}
        </div>
    );
};

export default ChatToolChip;
