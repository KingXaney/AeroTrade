// What the chat panel says before the learner types: the welcome line and the suggestion chips
// (components/chat/ChatPanel.tsx), and the usage caption under its header — what is left of the
// chat's rate-limit windows (lib/chat/usage.ts). lib/chat/__tests__/advice-voice.test.ts holds
// all of it to lib/learn/banned.ts with the prompts and tool descriptions. Import-free.

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
    "What is the culture brain seeing?",
];

// The caption's clauses, joined by `separator`. "Messages", not model calls: one message may
// spend up to five model steps, and the message is what the windows count. "Today" is the
// rolling day window; the reset clause says exactly when it turns.
export const CHAT_USAGE_COPY = {
    // "42 of 60 messages left today" — the reader's own day window; always shown.
    day: (left: number, limit: number): string => `${left} of ${limit} messages left today`,
    // "180 of 200 shared" — everyone's day window (the owner's "our limit"); always shown.
    shared: (left: number, limit: number): string => `${left} of ${limit} shared`,
    // "5 left this hour" — only while the hour window is the one about to refuse and is low.
    hour: (left: number): string => `${left} left this hour`,
    // "resets in 2h 10m" — the window the caption warns about, else the day's.
    resets: (until: string): string => `resets in ${until}`,
    separator: ' · ',
} as const;
