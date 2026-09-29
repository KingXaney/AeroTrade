// CSV cells for the trade export. Pure.
//
// A learner's note is free text, so a cell may start with a character a spreadsheet reads as
// a formula ("=1+1", "+CMD…", "@SUM(…)"). OWASP's CSV-injection guidance: prefix such a
// cell with a single quote so it opens as text. Numbers are written by the app, never by a
// person, so only strings are neutralised — a negative realized P&L stays a number.
const FORMULA_START = /^[=+\-@\t\r]/;

export const neutraliseFormula = (value: string): string => (FORMULA_START.test(value) ? `'${value}` : value);

// Every string cell is quoted (RFC 4180, embedded quotes doubled), not only one holding a
// comma: a spreadsheet whose locale separates fields with ';' would split an unquoted
// 'dip;=cmd|…' there and evaluate the half that starts with '='. Numbers stay bare.
export const csvField = (value: string | number): string =>
    typeof value === 'number' ? String(value) : `"${neutraliseFormula(value).replace(/"/g, '""')}"`;
