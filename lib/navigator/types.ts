// The AI Navigator's weekly decisions and a user's enrolment, as /brain and the chat read them.

export type SuggestionAction = 'buy' | 'sell' | 'hold';

export type SuggestionItem = {
    symbol: string;
    action: SuggestionAction;
    quantity?: number;            // planned whole shares (absent on global/hold items)
    targetWeight: number;
    currentWeight: number;
    score: number;
    reasons: string[];            // deterministic strings from scoring — never LLM output
    executed: boolean;
    executionPrice?: number;
    error?: string;
};

export type NavigatorStatus = {
    enrolled: boolean;
    status?: 'active' | 'paused';
    accountId?: string;
    enrolledAt?: number;          // epoch ms
    lastRunDate?: string;         // 'YYYY-MM-DD' ET
    lastError?: string;
};
