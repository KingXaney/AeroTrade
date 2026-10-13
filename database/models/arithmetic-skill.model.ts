import {Document, model, models, Schema} from "mongoose";

// What the arithmetic sprint has learned about one reader: per kind of problem
// (lib/games/arithmetic-cells), how many answered, their total time and their full wrong entries.
// One document per reader; lib/games/store.foldArithmeticSkill adds each kept round with one
// atomic $inc per kind, and the page reads it whole (lib/games/arithmetic-skill.skillView). Never
// a score: the records stay on the rounds. "Start over" deletes it; no TTL.
export interface ArithmeticSkillDoc extends Document {
    userId: string;
    // cell id → {n, ms, slips}; a plain object, so a kind's counters are $inc-ed by dotted path.
    cells: Record<string, {n: number; ms: number; slips: number}>;
    problems: number;
    rounds: number;
    since: Date;
    updatedAt: Date;
}

const ArithmeticSkillSchema = new Schema<ArithmeticSkillDoc>({
    userId: {type: String, required: true, unique: true},
    cells: {type: Schema.Types.Mixed, default: {}},
    problems: {type: Number, required: true, default: 0},
    rounds: {type: Number, required: true, default: 0},
    since: {type: Date, required: true},
    updatedAt: {type: Date, required: true},
});

const ArithmeticSkill = models?.ArithmeticSkill || model<ArithmeticSkillDoc>('ArithmeticSkill', ArithmeticSkillSchema);

export default ArithmeticSkill;
