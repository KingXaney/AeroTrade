// The explainTerm tool's output is data for the model, shaped here and nowhere else: the
// glossary entry resolveTerm found, the decoded reason, the learner's own figures and one
// constant stance line. These tests drive the shaper through the same resolver and decoder
// the tool calls, so a definition can only come from lib/learn/glossary.ts.

import {describe, expect, it} from 'vitest';
import {EXPLAIN_NOTES, EXPLAIN_STANCE, MAX_ECHO_CHARS, shapeExplain, type LearnerValue} from '@/lib/ai/explain';
import {GLOSSARY, resolveTerm} from '@/lib/learn/glossary';
import {decodeReason} from '@/lib/learn/reasons';
import {findBanned} from '@/lib/learn/banned';
import {MAX_PAPER_ACCOUNTS} from '@/lib/constants';

// What the tool does with its two inputs, minus the database read.
const explain = (input: {term?: string; reason?: string}, yours: LearnerValue | null = null) => {
    const entry = input.term ? resolveTerm(input.term) : null;
    const decoded = input.reason ? decodeReason(input.reason) : null;
    return shapeExplain({...input, entry, decoded, yours: entry ? yours : null});
};

const GOLDEN_CROSS = 'enter: SMA50 42.10 > SMA200 40.00 (+5.3%)';

describe('shapeExplain', () => {
    it("grounds the demo question in the glossary's own entry", () => {
        const out = explain({term: 'What is my max drawdown?'});
        expect(out.entry).toEqual({
            key: 'max-drawdown',
            kind: 'metric',
            term: 'Max drawdown',
            short: GLOSSARY['max-drawdown'].short,
            long: GLOSSARY['max-drawdown'].long,
            formula: GLOSSARY['max-drawdown'].formula,
            seeAlso: ['Recovery', 'Volatility'],
        });
        expect(out.reason).toBeNull();
        expect(out.notes).toEqual([]);
    });

    it('carries one constant stance line on every shape', () => {
        const shapes = [
            explain({term: 'win rate'}),
            explain({term: 'zorblax'}),
            explain({reason: GOLDEN_CROSS}),
            explain({reason: 'bought on a hunch'}),
            explain({}),
            explain({term: 'fomc', reason: GOLDEN_CROSS}),
            explain({term: 'total return'}, {accounts: []}),
        ];
        for (const out of shapes) expect(out.stance).toBe(EXPLAIN_STANCE);
    });

    it('says the app has no entry instead of defining from memory', () => {
        const out = explain({term: 'zorblax ratio'}, {accounts: [{account: 'Main Strategy', figures: {cash: 1}}]});
        expect(out.entry).toBeNull();
        expect(out.yours).toBeNull();
        expect(out.notes).toEqual([EXPLAIN_NOTES.noEntry]);
    });

    it('treats a pattern-shaped query as plain text', () => {
        for (const term of ['(.*)+[', '\\d{4}$', '.*', 'max drawdown|win rate']) {
            expect(() => explain({term}), term).not.toThrow();
        }
        expect(explain({term: '(.*)+['}).entry).toBeNull();
    });

    it('decodes a strategy reason clause by clause, each with its definition', () => {
        const out = explain({reason: GOLDEN_CROSS});
        expect(out.entry).toBeNull();
        expect(out.reason?.unrecognised).toEqual([]);
        expect(out.reason?.clauses.map((clause) => clause.text)).toEqual(['enter', 'SMA50 42.10 > SMA200 40.00', '(+5.3%)']);
        expect(out.reason?.clauses[0]).not.toHaveProperty('term');
        expect(out.reason?.clauses[1]).toMatchObject({term: GLOSSARY['trend-on'].term, definition: GLOSSARY['trend-on'].short});
        expect(out.reason?.clauses[2]).toMatchObject({term: GLOSSARY.spread.term, definition: GLOSSARY.spread.short});
        expect(out.notes).toEqual([]);
    });

    it('hands back a reason it cannot decode whole, clipped, with a note', () => {
        const hunch = explain({reason: 'bought on a hunch'});
        expect(hunch.reason).toEqual({clauses: [], unrecognised: ['bought on a hunch']});
        expect(hunch.notes).toEqual([EXPLAIN_NOTES.undecoded]);

        const long = explain({reason: 'x'.repeat(900)});
        expect(long.reason?.unrecognised[0].length).toBe(MAX_ECHO_CHARS);
        expect(long.reason?.unrecognised[0].endsWith('…')).toBe(true);
    });

    it('answers a term and a reason in one call', () => {
        const out = explain({term: 'fomc', reason: GOLDEN_CROSS});
        expect(out.entry?.key).toBe('fomc');
        expect(out.entry?.kind).toBe('concept');
        expect(out.reason?.clauses).toHaveLength(3);
    });

    it('asks for input when given nothing', () => {
        for (const input of [{}, {term: '   '}, {reason: ''}]) {
            const out = explain(input);
            expect(out.entry).toBeNull();
            expect(out.reason).toBeNull();
            expect(out.notes).toEqual([EXPLAIN_NOTES.nothingAsked]);
        }
    });
});

describe("shapeExplain — the learner's own figures", () => {
    it('rounds numbers and keeps only numbers, flags and dates', () => {
        const out = explain({term: 'max drawdown'}, {
            accounts: [{
                account: 'Main Strategy',
                figures: {
                    maxDrawdownPct: 5.882352941,
                    peakDate: '2026-09-19',
                    recovered: false,
                    recoveryPctNeeded: null,
                    broken: Number.NaN,
                    // A note a learner wrote never reaches the model, whatever a reader returns.
                    reason: 'bought because the CEO seemed confident',
                    when: '2026-09-19T12:00:00Z',
                },
            }],
        });
        expect(out.yours).toEqual({
            paper: true,
            accounts: [{
                account: 'Main Strategy',
                figures: {maxDrawdownPct: 5.88, peakDate: '2026-09-19', recovered: false, recoveryPctNeeded: null, broken: null},
            }],
        });
        expect(JSON.stringify(out)).not.toContain('CEO');
    });

    it('cleans and clips account names and caps the account list', () => {
        const accounts = Array.from({length: MAX_PAPER_ACCOUNTS + 3}, (_, i) => ({account: `Acct ${i}`, figures: {cash: i}}));
        accounts[0] = {account: `Line\none\u0000${'y'.repeat(200)}`, figures: {cash: 1}};
        const out = explain({term: 'cash'}, {accounts});
        expect(out.yours?.accounts).toHaveLength(MAX_PAPER_ACCOUNTS);
        const name = out.yours?.accounts[0].account ?? '';
        expect(name.startsWith('Line one ')).toBe(true);
        expect(name.length).toBeLessThanOrEqual(60);
        expect(name).not.toMatch(/[\u0000-\u001f]/);
    });

    it('says so when the learner has no paper account yet', () => {
        const out = explain({term: 'win rate'}, {accounts: []});
        expect(out.yours).toEqual({paper: true, accounts: []});
        expect(out.notes).toEqual([EXPLAIN_NOTES.noAccount]);
    });

    it('is plain JSON', () => {
        const out = explain({term: 'income', reason: GOLDEN_CROSS}, {accounts: [{account: 'A', figures: {interest: 12.345}}]});
        expect(JSON.parse(JSON.stringify(out))).toEqual(out);
    });
});

describe('explain copy', () => {
    it('keeps the stance line and every note descriptive', () => {
        for (const text of [EXPLAIN_STANCE, ...Object.values(EXPLAIN_NOTES)]) {
            expect(findBanned(text, 'copy'), text).toEqual([]);
        }
    });
});
