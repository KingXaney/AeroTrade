import {Document, model, models, Schema} from "mongoose";

// The owner's note for one ET day (lib/lab/checkin.ts): the focus written in the morning's
// check-in, the notes and tomorrow's focus written at the end of the day. One row per owner and
// day, upserted field by field by lib/lab/store.writeLabNote (a cleared field is unset, so absent
// reads as none), read for today and yesterday by readLabNotes. The owner's own words, bounded by
// FOCUS_MAX and NOTE_MAX, rendered as text and never as markdown.
export interface LabNoteDoc extends Document {
    userId: string;
    day: string;          // 'YYYY-MM-DD' ET
    focus?: string;       // the morning's one line
    notes?: string;       // the evening's notes on the day
    next?: string;        // tomorrow's focus, offered by the next morning's check-in
    updatedAt: Date;
}

const LabNoteSchema = new Schema<LabNoteDoc>({
    userId: {type: String, required: true},
    day: {type: String, required: true},
    focus: {type: String},
    notes: {type: String},
    next: {type: String},
    updatedAt: {type: Date, required: true},
});

LabNoteSchema.index({userId: 1, day: -1}, {unique: true});

const LabNote = models.LabNote || model<LabNoteDoc>("LabNote", LabNoteSchema);

export default LabNote;
