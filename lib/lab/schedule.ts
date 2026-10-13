// Which unit is today's, which cards are due and which problem is the day's. Pure, owner-paced:
// today's unit is the first unstudied unit of the least-advanced track (ties cv → ml → quant),
// so a missed day never skips a prerequisite and appending a unit never moves a past day; a unit
// stamped today stays today's; once every written unit is studied, the least recently studied
// comes round again. A unit's cards become due the day after it is studied.

import {LAB_TRACKS, type LabTrack, type LabUnit} from "@/lib/learn/copy/lab/types";
import {addCalendarDays} from "@/lib/dates";
import {type CardState, isDue} from "@/lib/lab/srs";

// A unit the owner has studied: the first day and the last.
export type StudiedRow = {unitId: string; day: string; lastDay: string};

export type TodaysUnit =
    | {kind: 'study'; unit: LabUnit}
    | {kind: 'studied-today'; unit: LabUnit}
    | {kind: 'revisit'; unit: LabUnit; firstDay: string; lastDay: string}
    | {kind: 'nothing-written'};

export const todaysUnit = (units: readonly LabUnit[], studied: readonly StudiedRow[], today: string): TodaysUnit => {
    const rows = new Map(studied.map((row) => [row.unitId, row]));
    const stampedToday = units.find((unit) => rows.get(unit.id)?.day === today || rows.get(unit.id)?.lastDay === today);
    if (stampedToday) return {kind: 'studied-today', unit: stampedToday};
    const perTrack = LAB_TRACKS.map((track) => {
        const mine = units.filter((unit) => unit.track === track);
        return {track, done: mine.filter((unit) => rows.has(unit.id)).length, next: mine.find((unit) => !rows.has(unit.id)) ?? null};
    }).filter((t) => t.next !== null);
    if (perTrack.length > 0) {
        const least = perTrack.reduce((a, b) => (b.done < a.done ? b : a));
        return {kind: 'study', unit: least.next!};
    }
    const revisit = units
        .map((unit) => ({unit, row: rows.get(unit.id)}))
        .filter((entry): entry is {unit: LabUnit; row: StudiedRow} => entry.row !== undefined)
        .sort((a, b) => a.row.lastDay.localeCompare(b.row.lastDay) || a.unit.id.localeCompare(b.unit.id))[0];
    return revisit ? {kind: 'revisit', unit: revisit.unit, firstDay: revisit.row.day, lastDay: revisit.row.lastDay} : {kind: 'nothing-written'};
};

export type TrackProgress = {track: LabTrack; done: number; written: number; planned: number};

export const progressByTrack = (units: readonly LabUnit[], plannedCount: Record<LabTrack, number>, studied: readonly StudiedRow[]): TrackProgress[] => {
    const done = new Set(studied.map((row) => row.unitId));
    return LAB_TRACKS.map((track) => {
        const mine = units.filter((unit) => unit.track === track);
        return {track, done: mine.filter((unit) => done.has(unit.id)).length, written: mine.length, planned: plannedCount[track]};
    });
};

// The day's problem: the unit's first problem the owner has not opened, else the one opened
// longest ago (a second pass hands out the next).
export const problemFor = (unit: LabUnit, revealed: readonly {problemId: string; day: string}[]): LabUnit['problems'][number] | null => {
    if (unit.problems.length === 0) return null;
    const opened = new Map(revealed.map((row) => [row.problemId, row.day]));
    return unit.problems.find((problem) => !opened.has(problem.id))
        ?? [...unit.problems].sort((a, b) => opened.get(a.id)!.localeCompare(opened.get(b.id)!))[0];
};

// ---- the review queue -------------------------------------------------------------------------

export const NEW_CARD_DELAY_DAYS = 1;
export const DUE_CAP = 20;

export type CardRef = {cardId: string; unitId: string};
export type CardRow = {cardId: string; state: CardState};
export type DueCard = {cardId: string; unitId: string; state: CardState | null; why: 'overdue' | 'due' | 'new'};

// Overdue cards first (oldest due first), then today's, then new cards of units studied at least
// NEW_CARD_DELAY_DAYS ago in registry order; capped.
export const dueCards = (
    cards: readonly CardRef[],
    rows: readonly CardRow[],
    studied: readonly StudiedRow[],
    today: string,
    cap = DUE_CAP,
): DueCard[] => {
    const rowById = new Map(rows.map((row) => [row.cardId, row.state]));
    const studiedOn = new Map(studied.map((row) => [row.unitId, row.day]));
    const seen: DueCard[] = [];
    const fresh: DueCard[] = [];
    for (const card of cards) {
        const state = rowById.get(card.cardId);
        if (state) {
            if (isDue(state, today)) seen.push({...card, state, why: state.dueOn < today ? 'overdue' : 'due'});
            continue;
        }
        const day = studiedOn.get(card.unitId);
        if (day !== undefined && addCalendarDays(day, NEW_CARD_DELAY_DAYS) <= today) fresh.push({...card, state: null, why: 'new'});
    }
    seen.sort((a, b) => a.state!.dueOn.localeCompare(b.state!.dueOn) || a.cardId.localeCompare(b.cardId));
    return [...seen, ...fresh].slice(0, cap);
};

export type ReviewSummary = {due: number; overdue: number; newCards: number; learned: number; total: number};

export const reviewSummary = (cards: readonly CardRef[], rows: readonly CardRow[], studied: readonly StudiedRow[], today: string): ReviewSummary => {
    const queue = dueCards(cards, rows, studied, today, Number.POSITIVE_INFINITY);
    return {
        due: queue.length,
        overdue: queue.filter((card) => card.why === 'overdue').length,
        newCards: queue.filter((card) => card.why === 'new').length,
        learned: rows.filter((row) => row.state.reps > 0).length,
        total: cards.length,
    };
};
