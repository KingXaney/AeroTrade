import {describe, expect, it} from 'vitest';
import {csvField, neutraliseFormula} from '@/lib/trading/csv';

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
