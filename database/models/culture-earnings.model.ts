import {Document, model, models, Schema} from "mongoose";

// A listed owner's last and next earnings dates, as the earnings calendar served them: the
// Quiet picker measures attention built since the last report. Absent when no calendar is
// configured or serves the symbol — the term then reads as neutral.
export interface CultureEarningsDoc extends Document {
    symbol: string;
    lastReportDate: string | null;   // 'YYYY-MM-DD'
    nextReportDate: string | null;
    checkedAt: Date;
}

const CultureEarningsSchema = new Schema<CultureEarningsDoc>({
    symbol: {type: String, required: true},
    lastReportDate: {type: String, default: null},
    nextReportDate: {type: String, default: null},
    checkedAt: {type: Date, default: Date.now},
});

CultureEarningsSchema.index({symbol: 1}, {unique: true});

const CultureEarnings = models?.CultureEarnings || model<CultureEarningsDoc>('CultureEarnings', CultureEarningsSchema);

export default CultureEarnings;
