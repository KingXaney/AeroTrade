// Reading a model answer that cites articles by number (the morning briefing, the daily brief).
// The model is shown numbered articles and no links; what it writes back is untrusted
// (invariant 4), so these are the shared pieces of checking it: a fenced answer is unwrapped,
// every text field is flattened and clamped, and a citation counts only when it names an article
// the model was actually shown. Pure.

export const stripFences = (text: string): string =>
    String(text ?? '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

// A string field, whitespace flattened and cut to `max`; anything else is ''.
export const cleanText = (value: unknown, max: number): string =>
    typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';

// The 0-based indices of the cited articles, in the order cited, each once: `numbers` are the
// model's 1-based "n"s; anything that is not an integer in 1..count is dropped, and at most `max`
// are kept.
export const citedIndices = (numbers: unknown, count: number, max: number): number[] => {
    if (!Array.isArray(numbers)) return [];
    const seen = new Set<number>();
    const out: number[] = [];
    for (const raw of numbers) {
        if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1 || raw > count || seen.has(raw)) continue;
        seen.add(raw);
        out.push(raw - 1);
        if (out.length >= max) break;
    }
    return out;
};
