// The lab's bank: every unit matches its syllabus row, carries what the page needs, renders its
// maths, and says nothing that aims an instruction at money or a security.

import {describe, expect, it} from 'vitest';
import katex from 'katex';
import {LAB_PLAN, LAB_TRACKS, LAB_UNITS, type LabUnit} from '@/lib/learn/copy/lab/bank';
import {findBanned} from '@/lib/learn/banned';
import {GLOSSARY, isGlossaryKey} from '@/lib/learn/glossary';
import {fencesOf, mathOf, proseOf} from '@/lib/lab/prose';
import {parseAnswer} from '@/lib/games/answer';
import {LAB_CARDS, LAB_PROBLEMS, LAB_UNIT_IDS, cardRefs, isLabCardId, isLabProblemId, isLabUnitId, plannedCountByTrack} from '@/lib/lab/registry';

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const words = (text: string): string[] => text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
const runsOf = (text: string, n = 5): Set<string> => {
    const w = words(text); const out = new Set<string>();
    for (let i = 0; i + n <= w.length; i += 1) out.add(w.slice(i, i + n).join(' '));
    return out;
};
const prose = (unit: LabUnit): string[] => [
    ...Object.values(unit.sections), ...unit.cards.flatMap((c) => [c.front, c.back]), ...unit.problems.flatMap((p) => [p.statement, ...p.hints, p.solution]),
];

describe('the syllabus', () => {
    it('has thirty rows, ten a track, with unique URL-safe ids and clean labels', () => {
        expect(LAB_PLAN).toHaveLength(30);
        for (const track of LAB_TRACKS) expect(LAB_PLAN.filter((row) => row.track === track)).toHaveLength(10);
        expect(new Set(LAB_PLAN.map((row) => row.id)).size).toBe(30);
        for (const row of LAB_PLAN) {
            expect(row.id, row.id).toMatch(ID);
            expect(row.id.startsWith(`${row.track}-`), row.id).toBe(true);
            for (const text of [row.title, row.oneLiner]) {
                expect(findBanned(text, 'copy'), `${row.id}: ${text}`).toEqual([]);
                expect(text, row.id).not.toMatch(/undefined|NaN|null|\[object/);
            }
        }
        expect(plannedCountByTrack()).toEqual({cv: 10, ml: 10, quant: 10});
    });
});

describe('every authored unit', () => {
    it('is a syllabus row, written in the track\'s order', () => {
        expect(LAB_UNITS.length).toBeGreaterThanOrEqual(9);
        for (const track of LAB_TRACKS) {
            const written = LAB_UNITS.filter((unit) => unit.track === track).map((unit) => unit.id);
            const planned = LAB_PLAN.filter((row) => row.track === track).map((row) => row.id);
            expect(written, track).toEqual(planned.slice(0, written.length));
        }
        for (const unit of LAB_UNITS) {
            const row = LAB_PLAN.find((r) => r.id === unit.id);
            expect(row, unit.id).toBeDefined();
            expect([unit.track, unit.title, unit.oneLiner], unit.id).toEqual([row!.track, row!.title, row!.oneLiner]);
        }
        expect(new Set(LAB_UNIT_IDS).size).toBe(LAB_UNITS.length);
    });

    it.each(LAB_UNITS.map((unit) => [unit.id, unit] as const))('%s carries what the page needs', (_id, unit) => {
        expect(unit.readingMinutes).toBeGreaterThanOrEqual(5);
        expect(unit.readingMinutes).toBeLessThanOrEqual(60);
        for (const [name, body] of Object.entries(unit.sections)) expect(body.trim().length, name).toBeGreaterThan(200);
        expect(unit.sections.maths).toMatch(/\$\$[\s\S]+?\$\$/);
        const fences = fencesOf(unit.sections.code);
        expect(fences.map((f) => f.info)).toEqual(['python']);
        expect(fences[0].body.split('\n').length).toBeGreaterThan(8);
        expect(unit.sources.length).toBeGreaterThanOrEqual(3);
        expect(unit.sources.length).toBeLessThanOrEqual(8);
        for (const source of unit.sources) {
            expect(source.url, source.title).toMatch(/^https:\/\//);
            expect(source.year).toBeGreaterThanOrEqual(1950);
            expect(source.year).toBeLessThanOrEqual(2026);
        }
        expect(unit.cards.length).toBeGreaterThanOrEqual(5);
        expect(unit.cards.length).toBeLessThanOrEqual(8);
        for (const card of unit.cards) {
            expect(card.id.startsWith(`${unit.id}/`), card.id).toBe(true);
            expect(card.front.trim().length, card.id).toBeGreaterThan(10);
            expect(card.back.trim().length, card.id).toBeGreaterThan(10);
            expect(card.tags.length, card.id).toBeGreaterThan(0);
        }
        expect(unit.problems.length).toBeGreaterThanOrEqual(1);
        expect(unit.problems.length).toBeLessThanOrEqual(2);
        unit.problems.forEach((problem, i) => {
            expect(problem.id, problem.id).toBe(`${unit.id}/p${i + 1}`);
            expect(problem.hints.length).toBeGreaterThanOrEqual(1);
            expect(problem.solution.trim().length, problem.id).toBeGreaterThan(80);
            if (problem.answer !== undefined) expect(parseAnswer(problem.answer), `${problem.id} answer ${problem.answer}`).not.toBeNull();
        });
        for (const key of unit.glossaryTerms ?? []) expect(isGlossaryKey(key), key).toBe(true);
        for (const other of unit.prerequisites ?? []) expect(LAB_PLAN.some((row) => row.id === other), other).toBe(true);
    });

    it.each(LAB_UNITS.map((unit) => [unit.id, unit] as const))('%s renders every formula and says nothing trading-directed', (_id, unit) => {
        for (const text of prose(unit)) {
            for (const span of mathOf(text)) {
                expect(() => katex.renderToString(span, {throwOnError: true, strict: 'ignore'}), `${unit.id}: ${span}`).not.toThrow();
            }
            expect(findBanned(proseOf(text), 'lab'), `${unit.id}: ${text.slice(0, 80)}`).toEqual([]);
            expect(text, unit.id).not.toMatch(/undefined|NaN|\[object/);
        }
        for (const text of [unit.title, unit.oneLiner]) expect(findBanned(text, 'copy'), `${unit.id}: ${text}`).toEqual([]);
        // A listed glossary entry is quoted beside the unit, never paraphrased in it.
        const mine = runsOf(prose(unit).map(proseOf).join(' '));
        for (const key of unit.glossaryTerms ?? []) {
            const shared = [...runsOf(GLOSSARY[key].long)].filter((run) => mine.has(run));
            expect(shared, `${unit.id} shares a five-word run with ${key}`).toEqual([]);
        }
    });
});

describe('the registries', () => {
    it('index every card and problem once, and refuse anything else', () => {
        expect(new Set(LAB_CARDS.map((c) => c.id)).size).toBe(LAB_CARDS.length);
        expect(new Set(LAB_PROBLEMS.map((p) => p.id)).size).toBe(LAB_PROBLEMS.length);
        expect(cardRefs().map((c) => c.cardId)).toEqual(LAB_CARDS.map((c) => c.id));
        expect(isLabUnitId(LAB_UNITS[0].id)).toBe(true);
        expect(isLabCardId(LAB_CARDS[0].id)).toBe(true);
        expect(isLabProblemId(LAB_PROBLEMS[0].id)).toBe(true);
        for (const junk of ['', 'cv-vit-dinov2/', 'constructor', '__proto__', 42, null, undefined, {}]) {
            expect(isLabUnitId(junk)).toBe(false);
            expect(isLabCardId(junk)).toBe(false);
            expect(isLabProblemId(junk)).toBe(false);
        }
    });
});
