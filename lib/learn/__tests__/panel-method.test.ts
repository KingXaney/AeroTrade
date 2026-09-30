// The paragraphs that lead a panel's one "What these mean" say only what the definitions listed
// beneath them do not (invariant 8: reference prose is stated once). The disclosure prints each
// listed entry's `long`, so no sentence of the lead may share a run of RUN words with a sentence
// of those entries — Luck or skill, Trading habits and Time in the market, each over its whole
// term list. A reworded restatement slips past a word run, so the lists and the paragraphs are
// also read side by side in review; this holds the copy-and-paste kind.

import {describe, expect, it} from 'vitest';
import {GLOSSARY, type GlossaryKey} from '@/lib/learn/glossary';
import {HABITS_COPY, HABITS_TERMS} from '@/lib/learn/copy/habits';
import {LUCK_COPY, LUCK_TERMS} from '@/lib/learn/copy/luck';
import {TIM_COPY, TIM_TERMS} from '@/lib/learn/copy/time-in-market';

const RUN = 5;

const words = (text: string): string[] => text.toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim().split(' ').filter(Boolean);
const sentences = (text: string): string[] => text.split(/(?<=[.;])\s+/).filter((s) => s.trim().length > 0);
const runs = (sentence: string): Set<string> => {
    const w = words(sentence);
    const out = new Set<string>();
    for (let i = 0; i + RUN <= w.length; i += 1) out.add(w.slice(i, i + RUN).join(' '));
    return out;
};

// Every (term, run, sentence) where a lead sentence repeats a run of a listed definition.
const restatements = (paragraphs: readonly string[], keys: readonly GlossaryKey[]): string[] =>
    paragraphs.flatMap(sentences).flatMap((sentence) => {
        const own = runs(sentence);
        return keys.flatMap((key) => sentences(GLOSSARY[key].long).flatMap((definition) =>
            [...runs(definition)].filter((run) => own.has(run)).map((run) => `${key}: "${run}" in "${sentence}"`)));
    });

describe('a panel lead says only what its definitions do not', () => {
    it('catches a lead sentence that repeats its definition', () => {
        expect(restatements(['The large caps were chosen in 2026, so the sample carries survivorship bias.'], ['survivorship-bias'])).not.toEqual([]);
        expect(restatements(['Each sell is paired with the oldest shares still held.'], ['hold-time'])).not.toEqual([]);
    });

    it('Luck or skill: the method', () => {
        for (const pool of [40, 23]) expect(restatements([LUCK_COPY.method({size: 5, pool})], LUCK_TERMS)).toEqual([]);
    });

    it('Trading habits: the method', () => {
        expect(restatements([HABITS_COPY.method], HABITS_TERMS)).toEqual([]);
    });

    it('Time in the market: why the start date matters', () => {
        expect(restatements(TIM_COPY.why, TIM_TERMS)).toEqual([]);
    });
});
