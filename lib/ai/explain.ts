// What the chat's explainTerm tool hands the model. The tool resolves the term with the
// glossary's one resolver (resolveTerm), decodes a strategy reason with decodeReason, and
// reads the learner's own figure through lib/ai/learner-hooks.ts; this module only shapes
// those results. Pure and import-light so the shape is unit-tested.
//
// The output is data for the model, never text for the page (invariant 4): definitions
// come verbatim from lib/learn/glossary.ts, every call carries the same stance line, and
// the learner's figures pass a whitelist — rounded numbers, flags and ISO dates — so no
// free text a reader happened to return (a trade note above all) can reach the model.

import {lookupTerm, type GlossaryEntry, type GlossaryKind} from '@/lib/learn/glossary';
import type {DecodedReason} from '@/lib/learn/reasons';
import {MAX_PAPER_ACCOUNTS} from '@/lib/constants';

export const EXPLAIN_STANCE =
    "These are the app's own definitions, and the learner's own paper-account figures where the app computes them. Define the term from this entry first, then apply it to their figure. The figures describe what already happened; no forecast or verdict on any stock follows from them.";

export const EXPLAIN_NOTES = {
    nothingAsked: 'No term or reason was given.',
    noEntry: 'The app has no glossary entry for this term.',
    undecoded: 'The app could not decode this reason: it is not a shape its strategies write.',
    noAccount: 'The learner has no paper account yet, so the app has no figure of theirs for this term.',
} as const;

// An unrecognised reason is echoed back at most this long; an account name at most this.
export const MAX_ECHO_CHARS = 200;
const MAX_NAME_CHARS = 60;

// A learner-value reader returns one of these per account: numbers, flags, ISO dates or
// null. Anything else is dropped on the way out.
export type LearnerFigure = number | boolean | string | null;
export type LearnerAccountValue = {account: string; figures: Readonly<Record<string, LearnerFigure>>};
export type LearnerValue = {accounts: readonly LearnerAccountValue[]};

export type ExplainParts = {
    term?: string;
    reason?: string;
    entry: GlossaryEntry | null;
    decoded: DecodedReason | null;
    yours: LearnerValue | null;
};

export type ExplainEntry = {
    key: string;
    kind: GlossaryKind;
    term: string;
    short: string;
    long: string;
    formula?: string;
    seeAlso: string[];
};

export type ExplainClause = {text: string; gloss: string; term?: string; definition?: string};

export type ExplainReason = {clauses: ExplainClause[]; unrecognised: string[]};

export type ExplainResult = {
    stance: string;
    entry: ExplainEntry | null;
    reason: ExplainReason | null;
    yours: {paper: true; accounts: LearnerAccountValue[]} | null;
    notes: string[];
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const hasText = (value: string | undefined): value is string => typeof value === 'string' && value.trim().length > 0;

const clean = (text: string): string => text.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();

const clip = (text: string, max: number): string => (text.length <= max ? text : `${text.slice(0, max - 1)}…`);

// Text echoed back to the model: control characters and runs of space folded, then clipped.
export const echoText = (text: string, max: number): string => clip(clean(text), max);

const round2 = (n: number): number => Math.round(n * 100) / 100;

const figure = (value: unknown): LearnerFigure | undefined => {
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? round2(value) : null;
    if (typeof value === 'string' && ISO_DATE.test(value)) return value;
    return undefined;
};

const shapeFigures = (figures: Readonly<Record<string, unknown>>): Record<string, LearnerFigure> =>
    Object.fromEntries(
        Object.entries(figures)
            .map(([name, value]) => [name, figure(value)] as const)
            .filter((pair): pair is readonly [string, LearnerFigure] => pair[1] !== undefined),
    );

const shapeEntry = (entry: GlossaryEntry): ExplainEntry => ({
    key: entry.key,
    kind: entry.kind,
    term: entry.term,
    short: entry.short,
    long: entry.long,
    ...(entry.formula ? {formula: entry.formula} : {}),
    seeAlso: (entry.seeAlso ?? []).flatMap((key) => lookupTerm(key)?.term ?? []),
});

// A decoded reason, each clause with the glossary's name and short definition for its term.
// getQuantStrategies (lib/ai/quant-strategies.ts) shapes its orders' reasons through it too.
export const shapeReason = (decoded: DecodedReason): ExplainReason => ({
    clauses: decoded.clauses.map((clause) => {
        const defined = clause.term ? lookupTerm(clause.term) : null;
        return {
            text: clause.text,
            gloss: clause.gloss,
            ...(defined ? {term: defined.term, definition: defined.short} : {}),
        };
    }),
    unrecognised: decoded.unknown.map((text) => echoText(text, MAX_ECHO_CHARS)),
});

export const shapeExplain = ({term, reason, entry, decoded, yours}: ExplainParts): ExplainResult => {
    const askedTerm = hasText(term);
    const askedReason = hasText(reason);
    const notes: string[] = [];
    if (!askedTerm && !askedReason) notes.push(EXPLAIN_NOTES.nothingAsked);

    const shapedEntry = askedTerm && entry ? shapeEntry(entry) : null;
    if (askedTerm && !shapedEntry) notes.push(EXPLAIN_NOTES.noEntry);

    const shapedReason = askedReason
        ? shapeReason(decoded ?? {clauses: [], unknown: [reason]})
        : null;
    if (shapedReason && shapedReason.clauses.length === 0) notes.push(EXPLAIN_NOTES.undecoded);

    // Figures only ever accompany the definition they apply to.
    const shapedYours = shapedEntry && yours
        ? {
            paper: true as const,
            accounts: yours.accounts.slice(0, MAX_PAPER_ACCOUNTS).map((a) => ({
                account: echoText(String(a.account), MAX_NAME_CHARS),
                figures: shapeFigures(a.figures),
            })),
        }
        : null;
    if (shapedYours && shapedYours.accounts.length === 0) notes.push(EXPLAIN_NOTES.noAccount);

    return {stance: EXPLAIN_STANCE, entry: shapedEntry, reason: shapedReason, yours: shapedYours, notes};
};
