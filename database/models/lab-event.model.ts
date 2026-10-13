import {Document, model, models, Schema} from "mongoose";

// The owner's lab stamps (lib/lab): one row per (owner, kind, key), written once by an atomic
// upsert, so a double click or a second tab cannot count twice.
//   unit:    key = the unit id; `day` the first day it was marked studied, `lastDay` the latest.
//   problem: key = the problem id; `day` the day its solution was opened (or its answer given).
//   session: key = the ET day itself; a day the owner graded a card or marked a unit. The lab's
//            streak is the distinct session days through lib/games/streak.streakFrom — derived,
//            never stored.

export type LabEventKind = 'unit' | 'problem' | 'session';

export interface LabEventDoc extends Document {
    userId: string;
    kind: LabEventKind;
    key: string;
    day: string;          // 'YYYY-MM-DD' ET
    lastDay: string;      // the latest day for a unit (revisits); equal to `day` otherwise
    how?: 'revealed' | 'solved';   // a problem: how it was closed
    at: Date;
}

const LabEventSchema = new Schema<LabEventDoc>({
    userId: {type: String, required: true},
    kind: {type: String, required: true, enum: ['unit', 'problem', 'session']},
    key: {type: String, required: true},
    day: {type: String, required: true},
    lastDay: {type: String, required: true},
    how: {type: String, enum: ['revealed', 'solved']},
    at: {type: Date, required: true},
});

LabEventSchema.index({userId: 1, kind: 1, key: 1}, {unique: true});
LabEventSchema.index({userId: 1, kind: 1, day: -1});

const LabEvent = models.LabEvent || model<LabEventDoc>("LabEvent", LabEventSchema);

export default LabEvent;
