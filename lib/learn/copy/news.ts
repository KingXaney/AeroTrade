// Every sentence the news page says in its own voice (app/(root)/news/page.tsx): section
// headings, the lines that frame the morning briefing, and what an empty section says. The
// briefing's text is model output, rendered as plain text (invariant 4); the headlines are the
// outlets' own. The test holds these to the 'copy' tier of lib/learn/banned.ts.

import {TOPIC_BRIEF_COPY} from "@/lib/learn/copy/topics";

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

export const NEWS_COPY = {
    customize: 'Customize feed',
    closeEditor: 'Close',
    editorDescription: 'Choose categories, regions, outlets and keywords for your News feed. These preferences also contribute headlines to the daily email.',

    briefingHeading: "Today's briefing",
    // "2026-10-02 · AI summary · may contain errors" — the same caveat a topic brief carries.
    briefingCaveat: (date: string): string => TOPIC_BRIEF_COPY.datedCaveat(date),
    briefingNote: 'Written each morning from the most important articles the news brain read. Each point links to the articles it draws on.',
    storiesHeading: 'The stories behind it',
    // "Touches what you hold or watch: AAPL, NVDA"
    touches: (symbols: readonly string[]): string => `Touches what you hold or watch: ${symbols.join(', ')}`,
    // "+2 more" after the outlets a point cites.
    moreSources: (count: number): string => `+${count} more`,

    topicsHeading: 'Your topics',
    topicsNote: 'Stories grouped by the interests you follow.',
    topicsLink: 'All topics',
    // "+3 more topics"
    moreTopics: (count: number): string => `+${plural(count, 'more topic', 'more topics')}`,
    topicQuiet: 'Nothing new in this topic since the last refresh.',

    holdingsHeading: 'Your holdings and watchlist',
    holdingsNote: 'Articles the news brain tagged with a symbol you hold or watch.',

    topHeading: 'Top stories',
    // "More headlines (18)"
    moreHeadlines: (count: number): string => `More headlines (${count})`,
    empty: 'No headlines right now. They refresh every few minutes.',
    fallback: 'Google News is unavailable right now. The market wires are standing in for your feed.',
} as const;
