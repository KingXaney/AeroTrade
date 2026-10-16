// The owner's lab progress: the reads the page makes and the writes the actions make, all bounded
// by the registry's size. Server-only (lib/lab/__tests__/guard.test.ts); the arithmetic lives in
// lib/lab/srs and lib/lab/schedule.

import LabCardState from "@/database/models/lab-card-state.model";
import LabEvent from "@/database/models/lab-event.model";
import UserPreferences from "@/database/models/user-preferences.model";
import {connectToDatabase} from "@/database/mongoose";
import {readLabLayout as readStoredLabLayout, type LabLayout} from "@/lib/lab/layout";
import {grade, newCardState, type CardState, type Grade} from "@/lib/lab/srs";
import type {CardRow, StudiedRow} from "@/lib/lab/schedule";

const SESSION_DAYS_LIMIT = 5000;
// Manual ticks: at most a handful a day, read newest first for the streak and today's list.
const TICKS_READ_LIMIT = 5000;

type EventRow = {key: string; day: string; lastDay: string; how?: 'revealed' | 'solved'; score?: number};
type CardDoc = {cardId: string; unitId: string; ease: number; intervalDays: number; dueOn: string; reps: number; lapses: number; gradedOn?: string};

export const readStudied = async (userId: string): Promise<StudiedRow[]> => {
    await connectToDatabase();
    const rows = await LabEvent.find({userId, kind: 'unit'}).select('key day lastDay').lean<EventRow[]>();
    return rows.map((row) => ({unitId: row.key, day: row.day, lastDay: row.lastDay}));
};

export type RevealedRow = {problemId: string; day: string; how: 'revealed' | 'solved'};

export const readRevealed = async (userId: string): Promise<RevealedRow[]> => {
    await connectToDatabase();
    const rows = await LabEvent.find({userId, kind: 'problem'}).select('key day how').lean<EventRow[]>();
    return rows.map((row) => ({problemId: row.key, day: row.day, how: row.how ?? 'revealed'}));
};

// Newest first; the streak reads the distinct days.
export const readSessionDays = async (userId: string): Promise<string[]> => {
    await connectToDatabase();
    const rows = await LabEvent.find({userId, kind: 'session'}).select('day').sort({day: -1}).limit(SESSION_DAYS_LIMIT).lean<{day: string}[]>();
    return rows.map((row) => row.day);
};

export const readCardRows = async (userId: string): Promise<(CardRow & {unitId: string; gradedOn: string | null})[]> => {
    await connectToDatabase();
    const docs = await LabCardState.find({userId}).select('cardId unitId ease intervalDays dueOn reps lapses gradedOn').lean<CardDoc[]>();
    return docs.map((doc) => ({cardId: doc.cardId, unitId: doc.unitId, gradedOn: doc.gradedOn ?? null, state: {ease: doc.ease, intervalDays: doc.intervalDays, dueOn: doc.dueOn, reps: doc.reps, lapses: doc.lapses}}));
};

export type QuizRow = {unitId: string; day: string; score: number};

// The quizzes passed, one row per unit.
export const readQuizzes = async (userId: string): Promise<QuizRow[]> => {
    await connectToDatabase();
    const rows = await LabEvent.find({userId, kind: 'quiz'}).select('key day score').lean<EventRow[]>();
    return rows.map((row) => ({unitId: row.key, day: row.day, score: row.score ?? 0}));
};

// The manual ticks of Today's list (lib/lab/todo.todoKey), newest first: the keys for today's
// list and the days for the streak.
export const readTickedKeys = async (userId: string): Promise<{key: string; day: string}[]> => {
    await connectToDatabase();
    const rows = await LabEvent.find({userId, kind: 'todo'}).select('key day').sort({day: -1}).limit(TICKS_READ_LIMIT).lean<EventRow[]>();
    return rows.map((row) => ({key: row.key, day: row.day}));
};

// The widgets' layout on Today, as stored (lib/lab/layout.readLabLayout: the saved layout, else
// the older list of ids at the default width, else the puzzle alone).
export const readLabLayout = async (userId: string): Promise<LabLayout> => {
    await connectToDatabase();
    const prefs = await UserPreferences.findOne({userId}).select('learn.labLayout learn.labWidgets').lean<{learn?: {labLayout?: unknown; labWidgets?: unknown}} | null>();
    return readStoredLabLayout(prefs?.learn);
};

// A saved layout takes the place of the older list, so the two can never disagree.
export const writeLabLayout = async (userId: string, layout: LabLayout): Promise<void> => {
    await connectToDatabase();
    await UserPreferences.updateOne(
        {userId},
        {
            $set: {'learn.labLayout': {version: layout.version, widgets: layout.widgets.map((w) => ({id: w.id, span: w.span}))}, updatedAt: new Date()},
            $unset: {'learn.labWidgets': 1},
        },
        {upsert: true},
    );
};

const isDuplicateKey = (error: unknown): boolean => (error as {code?: number})?.code === 11000;

// A quiz passed: the first pass sets the day and the score; a later pass changes nothing.
export const recordQuizPass = async (userId: string, unitId: string, today: string, score: number): Promise<{first: boolean}> => {
    await connectToDatabase();
    try {
        const result = await LabEvent.updateOne(
            {userId, kind: 'quiz', key: unitId},
            {$setOnInsert: {day: today, lastDay: today, score, at: new Date()}},
            {upsert: true},
        );
        return {first: result.upsertedCount === 1};
    } catch (error) {
        if (isDuplicateKey(error)) return {first: false};
        throw error;
    }
};

// A manual tick of Today's list, once per item and day; unticking removes the row.
export const tickTodo = async (userId: string, key: string, today: string): Promise<void> => {
    await connectToDatabase();
    try {
        await LabEvent.updateOne({userId, kind: 'todo', key}, {$setOnInsert: {day: today, lastDay: today, at: new Date()}}, {upsert: true});
    } catch (error) {
        if (!isDuplicateKey(error)) throw error;
    }
};

export const untickTodo = async (userId: string, key: string): Promise<void> => {
    await connectToDatabase();
    await LabEvent.deleteOne({userId, kind: 'todo', key});
};

// A unit marked studied: the first mark sets the day; a later one (a revisit) moves lastDay only.
export const markUnitStudied = async (userId: string, unitId: string, today: string): Promise<{first: boolean}> => {
    await connectToDatabase();
    const result = await LabEvent.updateOne(
        {userId, kind: 'unit', key: unitId},
        {$setOnInsert: {day: today, at: new Date()}, $set: {lastDay: today}},
        {upsert: true},
    );
    return {first: result.upsertedCount === 1};
};

// A problem closed: the first reveal or the first correct answer wins; a second is a no-op.
export const closeProblem = async (userId: string, problemId: string, today: string, how: 'revealed' | 'solved'): Promise<{first: boolean}> => {
    await connectToDatabase();
    try {
        const result = await LabEvent.updateOne(
            {userId, kind: 'problem', key: problemId},
            {$setOnInsert: {day: today, lastDay: today, how, at: new Date()}},
            {upsert: true},
        );
        return {first: result.upsertedCount === 1};
    } catch (error) {
        if (isDuplicateKey(error)) return {first: false};
        throw error;
    }
};

// The day counted toward the streak, once.
export const recordSession = async (userId: string, today: string): Promise<void> => {
    await connectToDatabase();
    try {
        await LabEvent.updateOne({userId, kind: 'session', key: today}, {$setOnInsert: {day: today, lastDay: today, at: new Date()}}, {upsert: true});
    } catch (error) {
        if (!isDuplicateKey(error)) throw error;
    }
};

export type GradeOutcome = {applied: boolean; next: CardState};

// One grade: the next state from the row as it stands (or a new card), written only if the row is
// still the one that was read, so a second tab grading the same state changes nothing.
export const gradeCard = async (userId: string, cardId: string, unitId: string, g: Grade, today: string): Promise<GradeOutcome> => {
    await connectToDatabase();
    const current = await LabCardState.findOne({userId, cardId}).select('ease intervalDays dueOn reps lapses').lean<CardDoc | null>();
    const base: CardState = current
        ? {ease: current.ease, intervalDays: current.intervalDays, dueOn: current.dueOn, reps: current.reps, lapses: current.lapses}
        : newCardState(today);
    const next = grade(base, g, today);
    const fields = {...next, lastGrade: g, gradedOn: today, updatedAt: new Date()};
    if (current) {
        const result = await LabCardState.updateOne({userId, cardId, reps: current.reps, lapses: current.lapses, dueOn: current.dueOn}, {$set: fields});
        return {applied: result.modifiedCount === 1, next};
    }
    try {
        await LabCardState.create({userId, cardId, unitId, ...fields});
        return {applied: true, next};
    } catch (error) {
        if (isDuplicateKey(error)) return {applied: false, next};
        throw error;
    }
};
