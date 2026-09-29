// CSV cells for the trade export. Pure.
//
// A learner's note is free text, so a cell may start with a character a spreadsheet reads as
// a formula ("=1+1", "+CMD…", "@SUM(…)"). OWASP's CSV-injection guidance: prefix such a
// cell with a single quote so it opens as text. Numbers are written by the app, never by a
// person, so only strings are neutralised — a negative realized P&L stays a number.
const FORMULA_START = /^[=+\-@\t\r]/;

export const neutraliseFormula = (value: string): string => (FORMULA_START.test(value) ? `'${value}` : value);

// RFC 4180 quoting: wrap in quotes when the value contains a comma, quote or newline.
export const csvField = (value: string | number): string => {
    const s = typeof value === 'number' ? String(value) : neutraliseFormula(value);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
