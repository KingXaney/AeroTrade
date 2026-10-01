// Copy for a followed topic's AI brief: the caveat every brief carries and the line a topic
// page shows before its first one. The brief itself is model output, rendered as plain text
// (invariant 4); these frame it. The test holds them to the 'copy' tier of lib/learn/banned.ts.

const CAVEAT = 'AI summary · may contain errors';

export const TOPIC_BRIEF_COPY = {
    caveat: CAVEAT,
    // In a list without the brief's own heading, the date leads the caveat.
    datedCaveat: (date: string): string => `${date} · ${CAVEAT}`,
    firstBrief: 'Your first “what changed today” brief arrives after tonight\'s refresh.',
} as const;
