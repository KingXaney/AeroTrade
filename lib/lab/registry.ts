// The lab's registries over the bank (lib/learn/copy/lab): every unit, card and problem by id,
// with the checks the actions run before a client-sent id is written. Server-only in use, as
// the bank is (lib/lab/__tests__/guard.test.ts): the page passes a client only what it may hold.

import {LAB_PLAN, LAB_TRACKS, LAB_UNITS, plannedRows, unitById, type LabCard, type LabProblem, type LabTrack, type LabUnit} from "@/lib/learn/copy/lab/bank";
import type {CardRef} from "@/lib/lab/schedule";

export {LAB_PLAN, LAB_TRACKS, LAB_UNITS, plannedRows, unitById};

export const LAB_UNIT_IDS: readonly string[] = LAB_UNITS.map((unit) => unit.id);

export const LAB_CARDS: readonly (LabCard & {unitId: string})[] = LAB_UNITS.flatMap((unit) => unit.cards.map((card) => ({...card, unitId: unit.id})));
const CARD_BY_ID: ReadonlyMap<string, LabCard & {unitId: string}> = new Map(LAB_CARDS.map((card) => [card.id, card]));

export const LAB_PROBLEMS: readonly (LabProblem & {unitId: string})[] = LAB_UNITS.flatMap((unit) => unit.problems.map((problem) => ({...problem, unitId: unit.id})));
const PROBLEM_BY_ID: ReadonlyMap<string, LabProblem & {unitId: string}> = new Map(LAB_PROBLEMS.map((problem) => [problem.id, problem]));

export const isLabUnitId = (id: unknown): id is string => typeof id === 'string' && unitById(id) !== null;
export const isLabCardId = (id: unknown): id is string => typeof id === 'string' && CARD_BY_ID.has(id);
export const isLabProblemId = (id: unknown): id is string => typeof id === 'string' && PROBLEM_BY_ID.has(id);

export const cardById = (id: string): (LabCard & {unitId: string}) | null => CARD_BY_ID.get(id) ?? null;
export const problemById = (id: string): (LabProblem & {unitId: string}) | null => PROBLEM_BY_ID.get(id) ?? null;

// Every card as the review queue refers to it, in registry order.
export const cardRefs = (): CardRef[] => LAB_CARDS.map((card) => ({cardId: card.id, unitId: card.unitId}));

export const unitsOf = (track: LabTrack): LabUnit[] => LAB_UNITS.filter((unit) => unit.track === track);

// How many syllabus rows each track has, written or not.
export const plannedCountByTrack = (): Record<LabTrack, number> =>
    Object.fromEntries(LAB_TRACKS.map((track) => [track, LAB_PLAN.filter((row) => row.track === track).length])) as Record<LabTrack, number>;
