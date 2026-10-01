import {describe, expect, it} from 'vitest';
import {
    TRADE_CSV_HEADER,
    accountExportHref,
    csvDownloadHeaders,
    csvField,
    neutraliseFormula,
    tradeCsvRow,
    tradesCsv,
    tradesCsvFilename,
} from '@/lib/trading/csv';

describe('neutraliseFormula', () => {
    it('prefixes a quote to every cell a spreadsheet would read as a formula', () => {
        for (const lead of ['=', '+', '-', '@', '\t', '\r']) {
            expect(neutraliseFormula(`${lead}1+1`)).toBe(`'${lead}1+1`);
        }
    });

    it('leaves ordinary text alone', () => {
        expect(neutraliseFormula('earnings beat')).toBe('earnings beat');
        expect(neutraliseFormula('')).toBe('');
    });
});

describe('csvField', () => {
    it('writes numbers bare, so a negative realized P&L stays a number', () => {
        expect(csvField(-12.5)).toBe('-12.5');
        expect(csvField(0)).toBe('0');
    });

    // Every string is quoted, not only those holding a comma: a spreadsheet in a locale whose
    // list separator is ';' splits an unquoted 'dip;=cmd|…' and evaluates its second half.
    it('quotes every string cell, the empty one and the header included', () => {
        expect(csvField('AAPL')).toBe('"AAPL"');
        expect(csvField('')).toBe('""');
        expect(csvField('realized_pnl')).toBe('"realized_pnl"');
        expect(csvField('dip;=cmd|\' /C calc\'!A0')).toBe('"dip;=cmd|\' /C calc\'!A0"');
    });

    it('neutralises a formula and doubles embedded quotes (RFC 4180)', () => {
        expect(csvField('=1+1')).toBe('"\'=1+1"');
        expect(csvField('a, b')).toBe('"a, b"');
        expect(csvField('say "hi"')).toBe('"say ""hi"""');
        expect(csvField('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
        expect(csvField('line\nbreak')).toBe('"line\nbreak"');
    });
});

// The one row builder both exports use: /api/accounts/[accountId]/export and
// /api/strategies/[slug]/export.
describe('tradesCsv', () => {
    const fill = {
        symbol: 'AAPL', company: 'Apple Inc', side: 'sell' as const, quantity: 2, price: 160, total: 320,
        realizedPnl: -12.5, source: 'strategy' as const, reason: 'exit: close below the 200-day average',
        createdAt: Date.UTC(2026, 8, 29, 13, 35),
    };

    it('writes the header the account export has always had', () => {
        expect(TRADE_CSV_HEADER).toEqual(['date', 'symbol', 'company', 'side', 'quantity', 'price', 'total', 'realized_pnl', 'source', 'reason']);
        expect(tradesCsv([])).toBe('"date","symbol","company","side","quantity","price","total","realized_pnl","source","reason"\n');
    });

    it('writes one row per fill, oldest first as given, with numbers bare and strings quoted', () => {
        const csv = tradesCsv([fill, {...fill, side: 'buy', realizedPnl: undefined, createdAt: Date.UTC(2026, 8, 30, 13, 35)}]);
        const [, first, second, end] = csv.split('\n');
        expect(first).toBe('"2026-09-29T13:35:00.000Z","AAPL","Apple Inc","sell",2,160,320,-12.5,"strategy","exit: close below the 200-day average"');
        expect(second).toBe('"2026-09-30T13:35:00.000Z","AAPL","Apple Inc","buy",2,160,320,"","strategy","exit: close below the 200-day average"');
        expect(end).toBe('');
    });

    it('takes a stored Date as well as epoch milliseconds', () => {
        expect(tradeCsvRow({...fill, createdAt: new Date(fill.createdAt)})).toBe(tradeCsvRow(fill));
    });

    // Blank, not guessed: a row from before `source` existed cannot be attributed after the fact.
    it('leaves an unknown source, a missing reason and a missing company blank or defaulted', () => {
        const row = tradeCsvRow({...fill, company: '', source: undefined, reason: undefined});
        expect(row).toBe('"2026-09-29T13:35:00.000Z","AAPL","AAPL","sell",2,160,320,-12.5,"",""');
    });

    it('neutralises a note a spreadsheet would run as a formula', () => {
        expect(tradeCsvRow({...fill, source: 'user', reason: '=1+1'}).endsWith(',"user","\'=1+1"')).toBe(true);
    });
});

describe('tradesCsvFilename', () => {
    it('names an account export after the account, as before', () => {
        expect(tradesCsvFilename('Main account')).toBe('main-account-trades.csv');
        expect(tradesCsvFilename('  Value / Growth #2 ')).toBe('value-growth-2-trades.csv');
        expect(tradesCsvFilename('!!!')).toBe('account-trades.csv');
    });

    it('adds the day when given one', () => {
        expect(tradesCsvFilename('golden-cross', '2026-09-30')).toBe('golden-cross-trades-2026-09-30.csv');
    });
});

describe('csvDownloadHeaders', () => {
    it('serves UTF-8 CSV as an attachment under the given name', () => {
        expect(csvDownloadHeaders('golden-cross-trades-2026-09-30.csv')).toEqual({
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="golden-cross-trades-2026-09-30.csv"',
        });
    });
});

describe('accountExportHref', () => {
    it('is the account export route for that account', () => {
        expect(accountExportHref('65f0c0ffee0000000000abcd')).toBe('/api/accounts/65f0c0ffee0000000000abcd/export');
    });
});
