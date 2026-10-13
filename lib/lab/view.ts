// What the lab page shows, shaped from the owner's rows and the bank by pure functions: today's
// unit, the review queue, the day's problem (its solution only once opened), the progress counts
// with the streak, the library, and the latest day of papers (null before the first run).

import type {LabPlanRow, LabTrack, LabUnit} from "@/lib/learn/copy/lab/types";
import {LAB_TRACKS} from "@/lib/learn/copy/lab/types";
import {type CardRef, type CardRow, dueCards, problemFor, progressByTrack, reviewSummary, type ReviewSummary, type StudiedRow, todaysUnit, type TrackProgress} from "@/lib/lab/schedule";
import {streakFrom, type Streak} from "@/lib/games/streak";
import type {RevealedRow} from "@/lib/lab/store";
import type {LabDayStored} from "@/lib/lab/papers/day";
import {shapePapersView, type LabPapersView} from "@/lib/lab/papers/view";

export type LabUnitSummary = {id: string; track: LabTrack; title: string; oneLiner: string; readingMinutes: number; cards: number};

export type LabReviewCard = {cardId: string; unitId: string; unitTitle: string; front: string; back: string; why: 'overdue' | 'due' | 'new'};

export type LabProblemView = {
    id: string;
    unitId: string;
    unitTitle: string;
    kind: LabUnit['problems'][number]['kind'];
    title: string;
    statement: string;
    hints: readonly string[];
    // A numeric problem takes an answer; the solution shows once opened.
    numeric: boolean;
    unit?: string;
    closed: RevealedRow | null;
    solution: string | null;
};

export type LabTodayView =
    | {kind: 'study' | 'studied-today'; unit: LabUnitSummary}
    | {kind: 'revisit'; unit: LabUnitSummary; firstDay: string; lastDay: string}
    | {kind: 'nothing-written'; next: LabPlanRow | null};

export type LabLibraryRow = {id: string; track: LabTrack; title: string; oneLiner: string; number: number; written: boolean; studiedOn: string | null};

export type LabView = {
    today: LabTodayView;
    review: {queue: LabReviewCard[]; summary: ReviewSummary};
    problem: LabProblemView | null;
    progress: {perTrack: TrackProgress[]; learned: number; dueToday: number; streak: Streak};
    library: {track: LabTrack; rows: LabLibraryRow[]}[];
    papers: LabPapersView | null;
};

export type LabViewInput = {
    today: string;
    units: readonly LabUnit[];
    plan: readonly LabPlanRow[];
    cards: readonly CardRef[];
    studied: readonly StudiedRow[];
    revealed: readonly RevealedRow[];
    sessionDays: readonly string[];
    cardRows: readonly CardRow[];
    labDay: LabDayStored | null;
};

const summary = (unit: LabUnit): LabUnitSummary => ({id: unit.id, track: unit.track, title: unit.title, oneLiner: unit.oneLiner, readingMinutes: unit.readingMinutes, cards: unit.cards.length});

const plannedCount = (plan: readonly LabPlanRow[]): Record<LabTrack, number> =>
    Object.fromEntries(LAB_TRACKS.map((track) => [track, plan.filter((row) => row.track === track).length])) as Record<LabTrack, number>;

export const shapeLabView = ({today, units, plan, cards, studied, revealed, sessionDays, cardRows, labDay}: LabViewInput): LabView => {
    const byId = new Map(units.map((unit) => [unit.id, unit]));
    const pick = todaysUnit(units, studied, today);
    const todayView: LabTodayView = pick.kind === 'nothing-written'
        ? {kind: 'nothing-written', next: plan.find((row) => !byId.has(row.id)) ?? null}
        : pick.kind === 'revisit'
            ? {kind: 'revisit', unit: summary(pick.unit), firstDay: pick.firstDay, lastDay: pick.lastDay}
            : {kind: pick.kind, unit: summary(pick.unit)};

    const queue = dueCards(cards, cardRows, studied, today).flatMap((due) => {
        const unit = byId.get(due.unitId);
        const card = unit?.cards.find((c) => c.id === due.cardId);
        return unit && card ? [{cardId: card.id, unitId: unit.id, unitTitle: unit.title, front: card.front, back: card.back, why: due.why}] : [];
    });
    const review = {queue, summary: reviewSummary(cards, cardRows, studied, today)};

    const unitForProblem = pick.kind === 'nothing-written' ? null : pick.unit;
    const problem = unitForProblem ? problemFor(unitForProblem, revealed) : null;
    const closed = problem ? revealed.find((row) => row.problemId === problem.id) ?? null : null;
    const problemView: LabProblemView | null = problem && unitForProblem ? {
        id: problem.id, unitId: unitForProblem.id, unitTitle: unitForProblem.title, kind: problem.kind, title: problem.title,
        statement: problem.statement, hints: problem.hints, numeric: problem.answer !== undefined, ...(problem.unit ? {unit: problem.unit} : {}),
        closed, solution: closed ? problem.solution : null,
    } : null;

    const studiedOn = new Map(studied.map((row) => [row.unitId, row.day]));
    const library = LAB_TRACKS.map((track) => ({
        track,
        rows: plan.filter((row) => row.track === track).map((row, i) => ({
            id: row.id, track, title: row.title, oneLiner: row.oneLiner, number: i + 1, written: byId.has(row.id), studiedOn: studiedOn.get(row.id) ?? null,
        })),
    }));

    return {
        today: todayView,
        review,
        problem: problemView,
        progress: {perTrack: progressByTrack(units, plannedCount(plan), studied), learned: review.summary.learned, dueToday: review.summary.due, streak: streakFrom(sessionDays, today)},
        library,
        papers: labDay ? shapePapersView(labDay, today) : null,
    };
};
