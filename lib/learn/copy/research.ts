// The words of a signal check, shared by both brains' tables (components/research/IcTable):
// research log R1, docs/research/log.md. Pure; held to the copy tier by
// lib/learn/__tests__/research-copy.test.ts.

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export const RESEARCH_COPY = {
    signalHeader: 'Signal',
    horizon: (weeks: number): string => (weeks === 1 ? '1 week' : `${weeks} weeks`),
    horizonCaption: 'Each column: the return over that many weeks after the decision.',
    tLine: (t: number | null): string => (t === null ? 't —' : `t ${t < 0 ? '−' : '+'}${Math.abs(t).toFixed(1)}`),
    weeksNote: (weeks: number): string => `Up to ${plural(weeks, 'week', 'weeks')} in a cell; a longer horizon leaves fewer weeks with a return to measure.`,
    hurdle: (figures: number): string => `${plural(figures, 'figure is', 'figures are')} read here together; among that many, a handful can sit beyond ±2 with no relation behind them.`,
} as const;
