// A template tag for a unit's markdown: String.raw keeps every backslash (\frac, \alpha, the \\
// of an aligned block), so a formula is written as it would be in a .tex file. The one escape an
// author writes is \` for a backtick inside a fenced block's info string; this restores it.
// Tested in lib/lab/__tests__/md.test.ts.
export const md = (strings: TemplateStringsArray, ...values: unknown[]): string =>
    String.raw(strings, ...values).replace(/\\`/g, '`');
