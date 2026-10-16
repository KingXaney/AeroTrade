// What the lab page shows, shaped from the owner's rows and the bank by pure functions: Today's
// list, today's unit (with its quiz's state), the review queue, the day's problem (its solution
// only once opened), the game widgets on the page in their layout, the progress counts with the
// one streak, the library, and the latest day of papers (null before the first run).

import type {LabPlanRow, LabTrack, LabUnit} from "@/lib/learn/copy/lab/types";
import {LAB_TRACKS} from "@/lib/learn/copy/lab/types";
import {type CardRef, type CardRow, dueCards, problemFor, progressByTrack, reviewSummary, type ReviewSummary, type StudiedRow, todaysUnit, type TrackProgress} from "@/lib/lab/schedule";
import type {Streak} from "@/lib/games/streak";
import type {DailyPuzzleCardView, GameSummary} from "@/lib/games/store";
import type {QuizRow, RevealedRow} from "@/lib/lab/store";
import {gamesOf, type LabLayout, type LabSpan} from "@/lib/lab/layout";
import {buildTodayList, listSummary, todoKey, type LabTodoItem} from "@/lib/lab/todo";
import {isLabWidgetId, labWidget, type LabWidgetId, type LabWidgetKind, type LabOutsideSite} from "@/lib/lab/widgets";
import type {LabDayStored} from "@/lib/lab/papers/day";
import {shapePapersView, type LabPapersView} from "@/lib/lab/papers/view";

export type LabUnitSummary = {id: string; track: LabTrack; title: string; oneLiner: string; readingMinutes: number; cards: number; quizPassedOn: string | null};

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

export type LabLibraryRow = {id: string; track: LabTrack; title: string; oneLiner: string; number: number; written: boolean; studiedOn: string | null; quizPassedOn: string | null};

// One game card on Today: where it sits (the layout's order), how wide, and what its card needs
// beside the copy's titles. The panels of the day are drawn from the view's other parts.
export type LabWidgetCard = {
    id: LabWidgetId;
    kind: LabWidgetKind;
    href: string;
    span: LabSpan;
    site?: LabOutsideSite;
    // A scored game's record on its default settings.
    record: number | null;
};

export type LabView = {
    list: LabTodoItem[];
    listSummary: {done: number; total: number};
    today: LabTodayView;
    review: {queue: LabReviewCard[]; summary: ReviewSummary};
    problem: LabProblemView | null;
    layout: LabLayout;
    widgets: LabWidgetCard[];
    // Today's puzzle, when its widget is on the page.
    puzzle: DailyPuzzleCardView | null;
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
    quizzes: readonly QuizRow[];
    cardRows: readonly (CardRow & {gradedOn?: string | null})[];
    labDay: LabDayStored | null;
    // The one streak, read by lib/learn/activity-store.
    streak: Streak;
    layout: LabLayout;
    puzzle: DailyPuzzleCardView | null;
    // The games with a kept round today, and each game widget's record.
    playedToday: readonly string[];
    gameSummaries: Readonly<Record<string, GameSummary>>;
    // The manual ticks' keys (lib/lab/todo.todoKey), any day.
    tickedKeys: readonly string[];
};

const summary = (unit: LabUnit, quizPassedOn: string | null): LabUnitSummary =>
    ({id: unit.id, track: unit.track, title: unit.title, oneLiner: unit.oneLiner, readingMinutes: unit.readingMinutes, cards: unit.cards.length, quizPassedOn});

const plannedCount = (plan: readonly LabPlanRow[]): Record<LabTrack, number> =>
    Object.fromEntries(LAB_TRACKS.map((track) => [track, plan.filter((row) => row.track === track).length])) as Record<LabTrack, number>;

// The manual items ticked on a day, from the keys.
const tickedOn = (tickedKeys: readonly string[], day: string): string[] =>
    tickedKeys.flatMap((key) => (key.endsWith(`:${day}`) ? [key.slice(0, key.length - day.length - 1)] : []));

export const shapeLabView = (input: LabViewInput): LabView => {
    const {today, units, plan, cards, studied, revealed, quizzes, cardRows, labDay, streak, layout, puzzle, playedToday, gameSummaries, tickedKeys} = input;
    const byId = new Map(units.map((unit) => [unit.id, unit]));
    const quizPassedOn = new Map(quizzes.map((row) => [row.unitId, row.day]));
    const pick = todaysUnit(units, studied, today);
    const todayView: LabTodayView = pick.kind === 'nothing-written'
        ? {kind: 'nothing-written', next: plan.find((row) => !byId.has(row.id)) ?? null}
        : pick.kind === 'revisit'
            ? {kind: 'revisit', unit: summary(pick.unit, quizPassedOn.get(pick.unit.id) ?? null), firstDay: pick.firstDay, lastDay: pick.lastDay}
            : {kind: pick.kind, unit: summary(pick.unit, quizPassedOn.get(pick.unit.id) ?? null)};

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
            id: row.id, track, title: row.title, oneLiner: row.oneLiner, number: i + 1, written: byId.has(row.id),
            studiedOn: studiedOn.get(row.id) ?? null, quizPassedOn: quizPassedOn.get(row.id) ?? null,
        })),
    }));

    const papers = labDay ? shapePapersView(labDay, today) : null;
    const widgetIds = gamesOf(layout);
    const list = buildTodayList({
        today,
        unit: pick.kind === 'nothing-written'
            ? {kind: 'nothing-written', id: null, title: null, quizPassed: false, revisitedToday: false}
            : {kind: pick.kind, id: pick.unit.id, title: pick.unit.title, quizPassed: quizPassedOn.has(pick.unit.id), revisitedToday: pick.kind === 'revisit' && pick.lastDay === today},
        review: {due: review.summary.due, overdue: review.summary.overdue, gradedToday: cardRows.some((row) => row.gradedOn === today)},
        problem: problemView ? {closed: problemView.closed !== null} : null,
        papers: papers !== null && (papers.digest !== null || papers.tracks.length > 0),
        widgets: widgetIds,
        puzzle: puzzle ? {status: puzzle.status} : null,
        playedToday,
        ticked: tickedOn(tickedKeys, today),
    });

    return {
        list,
        listSummary: listSummary(list),
        today: todayView,
        review,
        problem: problemView,
        layout,
        widgets: layout.widgets.flatMap(({id, span}) => {
            if (!isLabWidgetId(id)) return [];
            const widget = labWidget(id);
            return [{id, kind: widget.kind, href: widget.href, span, ...(widget.site ? {site: widget.site} : {}), record: widget.game ? gameSummaries[widget.game]?.record ?? null : null}];
        }),
        puzzle,
        progress: {perTrack: progressByTrack(units, plannedCount(plan), studied), learned: review.summary.learned, dueToday: review.summary.due, streak},
        library,
        papers,
    };
};

// The key a manual tick of today's item is stored under.
export const tickKeyFor = (id: string, today: string): string => todoKey(id, today);
