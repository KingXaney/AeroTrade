// What the chat panel says before the learner types: the welcome line and the suggestion chips
// (components/chat/ChatPanel.tsx). lib/chat/__tests__/advice-voice.test.ts holds both to
// lib/learn/banned.ts with the prompts and tool descriptions. Import-free.

export const CHAT_WELCOME_MESSAGE =
    "Hi — I'm your AeroTrade Advisor. Ask what's new in your topics, follow something new, look up a stock, or press \"Ask in chat\" beside any definition to have it explained.";

// No ticker and no verdict in a chip: the advisor teaches and reports, it never tips.
export const CHAT_SUGGESTIONS = [
    "What's new in my topics?",
    "Follow news about AI chips",
    "How is my paper portfolio doing?",
    "What does max drawdown mean?",
    "Explain what a P/E ratio measures",
    "How does a quant strategy decide?",
];
