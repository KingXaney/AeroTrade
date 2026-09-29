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
    it('neutralises strings but writes numbers as numbers', () => {
        expect(csvField('=1+1')).toBe("'=1+1");
        expect(csvField(-12.5)).toBe('-12.5');
    });

    it('quotes commas, quotes and line breaks (RFC 4180)', () => {
        expect(csvField('a, b')).toBe('"a, b"');
        expect(csvField('say "hi"')).toBe('"say ""hi"""');
        expect(csvField('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    });
});
