// Every sentence on the signed-in Home page (app/(root)/page.tsx). Descriptions only: the test
// holds each line to the 'copy' tier of lib/learn/banned.ts. The first-week steps keep their own
// wording in lib/learn/copy/missions.ts — Home quotes a step, it never rewrites one.

export const HOME_COPY = {
    // "Welcome back, Ada" — the first name only, and nothing at all when there is no name.
    greeting: (name: string | undefined): string => {
        const first = (name ?? '').trim().split(/\s+/)[0];
        return first ? `Welcome back, ${first}` : 'Welcome back';
    },
    subtitle: 'Your accounts, your topics and one thing to look at next.',

    nextStepHeading: 'Next step',
    // "2 of 5 first-week steps done"
    stepsDone: (done: number, total: number): string => `${done} of ${total} first-week steps done`,
    stepOpen: 'Open',

    accountsHeading: 'Your accounts',
    // "All 2 accounts" — only when there is more than one, as the rail's card says it.
    accountsTotal: (count: number): string => `All ${count} accounts`,
    totalReturn: 'total return',
    cash: 'Cash',
    holdings: (count: number): string => count === 0 ? 'No holdings yet' : `${count} ${count === 1 ? 'holding' : 'holdings'}`,
    portfolioLink: 'Open portfolio',

    topicsHeading: 'Your topics',
    briefingHeading: "Today's briefing",
    briefingNote: 'What changed in the topics you follow, written each morning.',
    // "+2 more points" under the market briefing's first ones.
    morePoints: (count: number): string => `+${count} more ${count === 1 ? 'point' : 'points'} in the news`,
    newsLink: 'Open the news',

    learnHeading: 'Keep learning',
    firstWeekHeading: 'First week',
    learnLink: 'Open Learn',
} as const;

// The step Home offers once the first-week list is done or gone: where the day is, not what to do.
export const HOME_STEPS = {
    marketOpen: {
        title: 'The market is open',
        body: 'A paper order placed now fills at the last quote, in whole shares.',
        href: '/trade',
        cta: 'Open the trade desk',
    },
    marketClosed: {
        title: 'The market is closed',
        body: 'Quotes show the last close until the next session; the news keeps arriving.',
        href: '/news',
        cta: 'Open the news',
    },
} as const;
