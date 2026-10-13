// A unit's prose: its markdown with the parts that are not sentences removed — fenced code
// blocks, inline code and KaTeX spans — so the no-advice check reads words, not symbols. Pure.

const FENCE = /```[\s\S]*?```/g;
const DISPLAY_MATH = /\$\$[\s\S]*?\$\$/g;
// An escaped dollar (\$5) is a dollar sign, not a delimiter.
const INLINE_MATH = /(?<!\\)\$((?:\\\$|[^$\n])+?)(?<!\\)\$/g;
const INLINE_CODE = /`[^`\n]*`/g;

export const proseOf = (markdown: string): string =>
    markdown.replace(FENCE, ' ').replace(DISPLAY_MATH, ' ').replace(INLINE_MATH, ' ').replace(INLINE_CODE, ' ').replace(/[ \t]+/g, ' ');

// The fenced blocks of a markdown body, with their info strings.
export const fencesOf = (markdown: string): {info: string; body: string}[] =>
    [...markdown.matchAll(/```([^\n]*)\n([\s\S]*?)```/g)].map((m) => ({info: m[1].trim(), body: m[2]}));

// Every maths span, display and inline, as the source KaTeX will render.
export const mathOf = (markdown: string): string[] => {
    const withoutFences = markdown.replace(FENCE, ' ').replace(INLINE_CODE, ' ');
    const display = [...withoutFences.matchAll(/\$\$([\s\S]*?)\$\$/g)].map((m) => m[1]);
    const rest = withoutFences.replace(DISPLAY_MATH, ' ');
    const inline = [...rest.matchAll(INLINE_MATH)].map((m) => m[1]);
    return [...display, ...inline];
};
