// The explainTerm tool's output is data for the model, shaped here and nowhere else: the
// glossary entry resolveTerm found, the decoded reason, the learner's own figures and one
// constant stance line. These tests drive the shaper through the same resolver and decoder
// choice the tool makes, so a definition can only come from lib/learn/glossary.ts.

import {describe, expect, it} from 'vitest';
import {
    decodeQuotedReason,
    EXPLAIN_NOTES,
    EXPLAIN_STANCE,
    MAX_ECHO_CHARS,
    shapeExplain,
    shapeReason,
    type ExplainResult,
    type LearnerValue,
    type ReasonWriter,
} from '@/lib/chat/explain';
import {GLOSSARY, resolveTerm} from '@/lib/learn/glossary';
import {decodeNavigatorReason, decodeReason, MAX_REASON_CHARS} from '@/lib/learn/reasons';
import {findBanned} from '@/lib/learn/banned';
import {MAX_PAPER_ACCOUNTS} from '@/lib/trading/config';

// What the tool does with its inputs, minus the database read.
const explain = (input: {term?: string; reason?: string; writer?: ReasonWriter}, yours: LearnerValue | null = null) => {
    const entry = input.term ? resolveTerm(input.term) : null;
    const readings = input.reason ? decodeQuotedReason(input.reason, input.writer) : null;
    return shapeExplain({term: input.term, reason: input.reason, entry, readings, yours: entry ? yours : null});
};

// The reason's one reading; a reason read both ways fails the test that expected one.
const oneReading = (out: ExplainResult) => {
    if (out.reason && 'readings' in out.reason) throw new Error('the reason came back read both ways');
    return out.reason;
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

    // The helper above nulls `yours` itself, as the tool skips the read; this calls the shaper
    // directly so its own guard is what keeps figures away from a term it could not define.
    it('drops the learner\'s figures itself when there is no entry to attach them to', () => {
        const yours: LearnerValue = {accounts: [{account: 'Main Strategy', figures: {maxDrawdownPct: 5.88}}]};
        const out = shapeExplain({term: 'zorblax ratio', entry: null, readings: null, yours});
        expect(out.entry).toBeNull();
        expect(out.yours).toBeNull();
        expect(out.notes).toEqual([EXPLAIN_NOTES.noEntry]);
        const reasonOnly = shapeExplain({reason: GOLDEN_CROSS, entry: null, readings: decodeQuotedReason(GOLDEN_CROSS), yours});
        expect(reasonOnly.yours).toBeNull();
        expect(JSON.stringify(reasonOnly)).not.toContain('5.88');
    });

    it('treats a pattern-shaped query as plain text', () => {
        for (const term of ['(.*)+[', '\\d{4}$', '.*', 'max drawdown|win rate']) {
            expect(() => explain({term}), term).not.toThrow();
        }
        expect(explain({term: '(.*)+['}).entry).toBeNull();
    });

    it('decodes a strategy reason clause by clause, each with its definition', () => {
        const out = explain({reason: GOLDEN_CROSS});
        const reason = oneReading(out);
        expect(out.entry).toBeNull();
        expect(reason?.unrecognised).toEqual([]);
        expect(reason?.clauses.map((clause) => clause.text)).toEqual(['enter', 'SMA50 42.10 > SMA200 40.00', '(+5.3%)']);
        expect(reason?.clauses[0]).not.toHaveProperty('term');
        expect(reason?.clauses[1]).toMatchObject({term: GLOSSARY['trend-on'].term, definition: GLOSSARY['trend-on'].short});
        expect(reason?.clauses[2]).toMatchObject({term: GLOSSARY.spread.term, definition: GLOSSARY.spread.short});
        expect(reason?.writer).toBe('strategy');
        expect(out.notes).toEqual([]);
    });

    it('hands back a reason it cannot decode whole, clipped, with a note', () => {
        const hunch = explain({reason: 'bought on a hunch'});
        expect(hunch.reason).toEqual({clauses: [], unrecognised: ['bought on a hunch']});
        expect(hunch.notes).toEqual([EXPLAIN_NOTES.undecoded]);

        const long = oneReading(explain({reason: 'x'.repeat(900)}));
        expect(long?.unrecognised[0].length).toBe(MAX_ECHO_CHARS);
        expect(long?.unrecognised[0].endsWith('…')).toBe(true);
    });

    it('answers a term and a reason in one call', () => {
        const out = explain({term: 'fomc', reason: GOLDEN_CROSS});
        expect(out.entry?.key).toBe('fomc');
        expect(out.entry?.kind).toBe('concept');
        expect(oneReading(out)?.clauses).toHaveLength(3);
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

// The AI Navigator writes its own reasons (getAiSuggestions hands them to the model), in a
// grammar of its own. Named, the writer's grammar reads a quoted reason first and the other
// reads only what it leaves whole; unnamed, a shape both grammars read is read both ways.
describe('decodeQuotedReason — strategy or Navigator', () => {
    const NAV_NEWS = 'slow news weight 3.2 (rank 4/59)';
    const NAV_NEUTRAL = 'no brain coverage — news neutral';
    const NAV_ENTER = 'enter: score 0.42';
    const SHARED = 'rebalance +3.8% drift toward 12.0% target';

    it('reads a strategy reason with the strategies\' grammar', () => {
        expect(decodeQuotedReason(GOLDEN_CROSS)).toEqual([{writer: 'strategy', decoded: decodeReason(GOLDEN_CROSS)}]);
    });

    it('reads a Navigator reason the strategies\' grammar leaves whole', () => {
        for (const reason of [NAV_NEWS, NAV_NEUTRAL, NAV_ENTER, 'exit: thesis broken', 'holding — no exit trigger']) {
            expect(decodeReason(reason).clauses, reason).toEqual([]);
            expect(decodeQuotedReason(reason), reason).toEqual([{writer: 'navigator', decoded: decodeNavigatorReason(reason)}]);
            expect(decodeNavigatorReason(reason).clauses.length, reason).toBeGreaterThan(0);
        }
    });

    it('reads garbage no way at all, and hands it back whole', () => {
        for (const reason of ['bought on a hunch', '(.*)+[', 'rebalance lots']) {
            expect(decodeQuotedReason(reason), reason).toEqual([]);
            expect(decodeQuotedReason(reason, 'navigator'), reason).toEqual([]);
            expect(oneReading(explain({reason}))?.unrecognised, reason).toEqual([reason]);
        }
    });

    // The two engines write this shape under different bands, so without a writer neither
    // reading is the reason's: the strategies' is not a default.
    it('reads a shape both engines write both ways when no writer is named', () => {
        expect(decodeQuotedReason(SHARED)).toEqual([
            {writer: 'strategy', decoded: decodeReason(SHARED)},
            {writer: 'navigator', decoded: decodeNavigatorReason(SHARED)},
        ]);
        expect(decodeNavigatorReason(SHARED)).not.toEqual(decodeReason(SHARED));
    });

    it('reads a shape both engines write by the named writer alone', () => {
        expect(decodeQuotedReason(SHARED, 'strategy')).toEqual([{writer: 'strategy', decoded: decodeReason(SHARED)}]);
        expect(decodeQuotedReason(SHARED, 'navigator')).toEqual([{writer: 'navigator', decoded: decodeNavigatorReason(SHARED)}]);
    });

    it('falls back to the other grammar when the hint names the wrong writer', () => {
        expect(decodeQuotedReason(GOLDEN_CROSS, 'navigator')).toEqual([{writer: 'strategy', decoded: decodeReason(GOLDEN_CROSS)}]);
        expect(decodeQuotedReason(NAV_ENTER, 'strategy')).toEqual([{writer: 'navigator', decoded: decodeNavigatorReason(NAV_ENTER)}]);
    });

    it('keeps the decoders\' length guard: an overlong reason is not read at all', () => {
        const stale = `12/40 symbols stale: ${'ABC, '.repeat(120)}`;
        expect(stale.length).toBeGreaterThan(MAX_REASON_CHARS);
        expect(decodeQuotedReason(stale)).toEqual([]);
    });

    it('hands the model both readings of a shared shape, with no one writer and a note saying why', () => {
        const out = explain({reason: SHARED});
        expect(out.reason).toEqual({
            readings: [
                {writer: 'strategy', ...shapeReason(decodeReason(SHARED))},
                {writer: 'navigator', ...shapeReason(decodeNavigatorReason(SHARED))},
            ],
        });
        expect(out.reason).not.toHaveProperty('writer');
        expect(out.notes).toEqual([EXPLAIN_NOTES.sharedShape]);
        // The band clause is where the two readings part.
        const [strategy, navigator] = out.reason && 'readings' in out.reason ? out.reason.readings : [];
        expect(strategy?.clauses[0].gloss).not.toBe(navigator?.clauses[0].gloss);

        for (const writer of ['strategy', 'navigator'] as const) {
            const named = explain({reason: SHARED, writer});
            expect(oneReading(named)?.writer, writer).toBe(writer);
            expect(named.notes, writer).toEqual([]);
        }
    });

    it('hands the model the Navigator\'s clauses with the glossary\'s definitions', () => {
        const out = explain({reason: NAV_NEWS});
        const reason = oneReading(out);
        expect(reason?.writer).toBe('navigator');
        expect(reason?.unrecognised).toEqual([]);
        expect(reason?.clauses[0]).toMatchObject({text: 'slow news weight 3.2', term: GLOSSARY['news-weight'].term, definition: GLOSSARY['news-weight'].short});
        expect(out.notes).toEqual([]);

        const neutral = oneReading(explain({reason: NAV_NEUTRAL}));
        expect(neutral?.clauses).toHaveLength(1);
        expect(neutral?.clauses[0].text).toBe(NAV_NEUTRAL);

        const hunch = explain({reason: 'bought on a hunch', writer: 'navigator'});
        expect(hunch.reason).toEqual({clauses: [], unrecognised: ['bought on a hunch']});
        expect(hunch.notes).toEqual([EXPLAIN_NOTES.undecoded]);
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
