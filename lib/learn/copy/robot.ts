// What the robot — the assistant's launcher (components/chat/ChatWidget) — says in its speech
// bubble on the topics pages (components/chat/RobotTipBubble), and the bubble's two controls. A
// tip is one or two true sentences about the app; one with a `prompt` offers "Try it", which types
// the prompt into the chat composer and sends nothing, so a prompt is chat input and held to the
// advice tier like a chip. Import-free: the numbers are literals, so the client bundle carries no
// catalog on every page; lib/learn/__tests__/robot-copy.test.ts pins each one to the constant it
// quotes and holds every string to lib/learn/banned.ts at both tiers. Neither control names chat,
// assistant or advisor: the browser QA finds the launcher by those words.

export type RobotTip = {id: string; text: string; prompt?: string};

export const ROBOT_COPY = {
    tryIt: 'Try it',
    dismiss: 'Dismiss tip',
} as const;

// The first entry is the lead tip, shown first in every browser session; the rest follow in an
// order the ET date decides (lib/chat/robot-tips.robotTipOrder).
export const ROBOT_TIPS: readonly RobotTip[] = [
    {
        id: 'build-topics',
        text: "Tell me what you're into — teams, companies, places, anything — and I'll follow news topics that match. I can unfollow any of them later, too.",
        prompt: 'Follow topics for me that match these interests:',
    },
    {
        id: 'whats-new',
        text: "Ask me what's new in your topics and I'll go through each one's newest headline and today's brief, when it has one.",
        prompt: "What's new in my topics?",
    },
    {
        id: 'command-k',
        text: 'Press ⌘K (Ctrl+K on Windows) and type any subject: the Topics row follows it as a new topic. The same box finds pages, glossary terms and stocks.',
    },
    {
        id: 'morning-briefing',
        text: "The News page opens with the morning briefing: one AI summary of the day's market news, written at 07:50 ET with its sources cited.",
    },
    {
        id: 'topic-actions',
        text: "On a topic's page, Topic actions lets you edit the keywords that match its articles, or stop following it.",
    },
    {
        id: 'strategies',
        text: "Eight rule-based quant strategies paper-trade on their own; the Strategies page shows each one's live return and the benchmark's over the same days.",
    },
    {
        id: 'what-these-mean',
        text: '"What these mean" under a panel\'s figures defines its terms; "Ask in chat" beside a definition types the question into my composer and sends nothing until you press Send.',
    },
    {
        id: 'themes',
        text: 'Settings → Appearance has twelve palettes and five visual styles; hovering a card previews it before you choose. Its Reduce motion switch keeps me still.',
    },
    {
        id: 'learn-course',
        text: "The Learn page has a beginner course: four modules of four short lessons, each quoting the app's own definitions.",
    },
    {
        id: 'rail-portfolio',
        text: 'On a wide screen, hovering the Portfolio icon on the left rail shows your total, cash and top holdings without leaving the page.',
    },
];
