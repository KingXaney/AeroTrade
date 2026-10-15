import {Document, model, models, Schema} from "mongoose";

// The owner's lab stamps (lib/lab): one row per (owner, kind, key), written once by an atomic
// upsert, so a double click or a second tab cannot count twice.
//   unit:    key = the unit id; `day` the first day it was marked studied, `lastDay` the latest.
//   problem: key = the problem id; `day` the day its solution was opened (or its answer given).
//   session: key = the ET day itself; a day the owner graded a card, marked a unit, answered a
//            problem or passed a quiz. The streak counts these days with the puzzle's, the games'
//            and the ticks' (lib/learn/activity.ts) through lib/games/streak.streakFrom —
//            derived, never stored.
//   quiz:    key = the unit id; `day` the day its quiz was first passed, `score` the correct count.
//            The row is what lets the unit be marked studied (lib/actions/lab.actions).
//   todo:    key = `${item}:${day}` (lib/lab/todo.todoKey): an item of Today's list the owner
//            ticked by hand — the papers digest, a table, a site outside the app. Unticking
//            deletes the row.

export type LabEventKind = 'unit' | 'problem' | 'session' | 'quiz' | 'todo';

export interface LabEventDoc extends Document {
    userId: string;
    kind: LabEventKind;
    key: string;
    day: string;          // 'YYYY-MM-DD' ET
    lastDay: string;      // the latest day for a unit (revisits); equal to `day` otherwise
    how?: 'revealed' | 'solved';   // a problem: how it was closed
    score?: number;       // a quiz: the correct count on the pass
    at: Date;
}

const LabEventSchema = new Schema<LabEventDoc>({
    userId: {type: String, required: true},
    kind: {type: String, required: true, enum: ['unit', 'problem', 'session', 'quiz', 'todo']},
    key: {type: String, required: true},
    day: {type: String, required: true},
    lastDay: {type: String, required: true},
    how: {type: String, enum: ['revealed', 'solved']},
    score: {type: Number},
    at: {type: Date, required: true},
});

LabEventSchema.index({userId: 1, kind: 1, key: 1}, {unique: true});
LabEventSchema.index({userId: 1, kind: 1, day: -1});

const LabEvent = models.LabEvent || model<LabEventDoc>("LabEvent", LabEventSchema);

export default LabEvent;
