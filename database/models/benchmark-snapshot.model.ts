import {Document, model, models, Schema} from "mongoose";

export interface BenchmarkSnapshotDoc extends Document {
    symbol: string;           // e.g. 'SPY'
    date: string;             // 'YYYY-MM-DD' in America/New_York
    close: number;
}

const BenchmarkSnapshotSchema = new Schema<BenchmarkSnapshotDoc>({
    symbol: {type: String, required: true, uppercase: true, trim: true},
    date: {type: String, required: true},
    close: {type: Number, required: true},
});

BenchmarkSnapshotSchema.index({symbol: 1, date: 1}, {unique: true});

const BenchmarkSnapshot = models?.BenchmarkSnapshot || model<BenchmarkSnapshotDoc>('BenchmarkSnapshot', BenchmarkSnapshotSchema);

export default BenchmarkSnapshot;
