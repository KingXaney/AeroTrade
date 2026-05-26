import {Check, Loader2, AlertCircle, Wrench} from "lucide-react";
import {cn} from "@/lib/utils";

type ToolState = 'input-streaming' | 'input-available' | 'output-available' | 'output-error';

type ChatToolChipProps = {
    toolName: string;
    state: ToolState;
    summary?: string;
};

// Human-friendly labels for each tool. Keys match the union in [[chat-types]].
const LABELS: Record<string, string> = {
    searchStock: 'Searching stocks',
    getStockQuote: 'Fetching quote',
    getStockProfile: 'Fetching company profile',
    getStockFinancials: 'Fetching financials',
    getWatchlist: 'Reading your watchlist',
    addStockToWatchlist: 'Adding to watchlist',
    removeStockFromWatchlist: 'Removing from watchlist',
    getMarketNews: 'Fetching market news',
};

const ChatToolChip = ({toolName, state, summary}: ChatToolChipProps) => {
    const label = LABELS[toolName] || toolName;

    const Icon =
        state === 'output-error' ? AlertCircle :
        state === 'output-available' ? Check :
        state === 'input-available' || state === 'input-streaming' ? Loader2 :
        Wrench;

    return (
        <div
            className={cn(
                'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs',
                state === 'output-error'
                    ? 'border-red-500/40 bg-red-500/10 text-red-300'
                    : state === 'output-available'
                        ? 'border-yellow-500/40 bg-yellow-500/10 text-yellow-300'
                        : 'border-gray-700 bg-gray-800/60 text-gray-300',
            )}
        >
            <Icon
                className={cn(
                    'size-3.5',
                    (state === 'input-available' || state === 'input-streaming') && 'animate-spin',
                )}
            />
            <span className="font-medium">{label}</span>
            {summary && <span className="text-gray-400">— {summary}</span>}
        </div>
    );
};

export default ChatToolChip;
