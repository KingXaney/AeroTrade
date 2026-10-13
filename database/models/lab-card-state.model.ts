import {Document, model, models, Schema} from "mongoose";

// The owner's review cards (lib/lab/srs): one row per (owner, card) once the card has been
// graded; a card with no row is new. Every write is one update filtered on the state the client
// saw (reps, lapses, dueOn), so a second grade of the same state matches nothing.

export interface LabCardStateDoc extends Document {
    userId: string;
    cardId: string;       // lib/lab/registry id, never renamed
    unitId: string;
    ease: number;
    intervalDays: number;
    dueOn: string;        // 'YYYY-MM-DD' ET
    reps: number;
    lapses: number;
    lastGrade: 'again' | 'hard' | 'good' | 'easy';
    gradedOn: string;     // 'YYYY-MM-DD' ET
    updatedAt: Date;
}

const LabCardStateSchema = new Schema<LabCardStateDoc>({
    userId: {type: String, required: true},
    cardId: {type: String, required: true},
    unitId: {type: String, required: true},
    ease: {type: Number, required: true},
    intervalDays: {type: Number, required: true},
    dueOn: {type: String, required: true},
    reps: {type: Number, required: true},
    lapses: {type: Number, required: true},
    lastGrade: {type: String, required: true, enum: ['again', 'hard', 'good', 'easy']},
    gradedOn: {type: String, required: true},
    updatedAt: {type: Date, required: true},
});

LabCardStateSchema.index({userId: 1, cardId: 1}, {unique: true});
LabCardStateSchema.index({userId: 1, dueOn: 1});

const LabCardState = models.LabCardState || model<LabCardStateDoc>("LabCardState", LabCardStateSchema);

export default LabCardState;
