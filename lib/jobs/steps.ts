// The two helpers every scheduled job builds its steps with. Pure, so vitest pins them.

// Inngest step ids must be [a-zA-Z0-9_-]; user ids, emails, the strategies' sentinel owner and
// symbols such as BRK.B carry other characters. Idempotent: a sanitised id passes unchanged.
export const stepId = (raw: string): string => raw.replace(/[^a-zA-Z0-9_-]/g, '_');

// Bounded slices in order, none dropped — one step per slice keeps each inside the route's
// time budget. A size below 1 is treated as 1.
export const chunk = <T>(items: readonly T[], size: number): T[][] => {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += Math.max(1, size)) {
        chunks.push(items.slice(i, i + Math.max(1, size)));
    }
    return chunks;
};
