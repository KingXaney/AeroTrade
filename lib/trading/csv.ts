// CSV cells and rows for the trade exports (an account's, a quant strategy's). Pure.
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

// One fill as the exports write it: a PaperTradeRecord (epoch-ms createdAt) or a lean stored row
// (a Date). Only the columns are read.
export type CsvTrade = {
    symbol: string;
    company?: string;
    side: 'buy' | 'sell';
    quantity: number;
    price: number;
    total: number;
    realizedPnl?: number;
    source?: string;
    reason?: string;
    createdAt: Date | number;
};

export const TRADE_CSV_HEADER = ['date', 'symbol', 'company', 'side', 'quantity', 'price', 'total', 'realized_pnl', 'source', 'reason'] as const;

export const tradeCsvRow = (t: CsvTrade): string => [
    new Date(t.createdAt).toISOString(),
    t.symbol,
    t.company || t.symbol,
    t.side,
    t.quantity,
    t.price,
    t.total,
    typeof t.realizedPnl === 'number' ? t.realizedPnl : '',
    t.source ?? '',   // blank = placed before the field existed; not reconstructable, so not guessed
    t.reason ?? '',   // the learner's own note or an automated caller's reason; csvField neutralises formulas
].map(csvField).join(',');

// The whole file, in the order given (both exports read oldest first), newline-terminated.
export const tradesCsv = (trades: readonly CsvTrade[]): string =>
    [TRADE_CSV_HEADER.map(csvField).join(','), ...trades.map(tradeCsvRow)].join('\n') + '\n';

// Where one account's CSV export is served (app/api/accounts/[accountId]/export); every link to
// it is built here.
export const accountExportHref = (accountId: string): string => `/api/accounts/${accountId}/export`;

const slugify = (name: string): string =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'strategy';

// "<name>-trades.csv", or "<name>-trades-<YYYY-MM-DD>.csv" when the export is dated.
export const tradesCsvFilename = (name: string, date?: string): string =>
    `${slugify(name)}-trades${date ? `-${date}` : ''}.csv`;

export const csvDownloadHeaders = (filename: string): Record<string, string> => ({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
});
