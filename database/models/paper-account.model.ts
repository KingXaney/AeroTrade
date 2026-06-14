import {Document, model, models, Schema} from "mongoose";

export interface PaperPositionDoc {
    symbol: string;
    company: string;
    quantity: number;
    avgCost: number;
}

export interface PaperAccountDoc extends Document {
    userId: string;
    cash: number;
    startingBalance: number;
    positions: PaperPositionDoc[];
    createdAt: Date;
    updatedAt: Date;
}

const PaperPositionSchema = new Schema<PaperPositionDoc>(
    {
        symbol: {type: String, required: true, uppercase: true, trim: true},
        company: {type: String, default: ''},
        quantity: {type: Number, required: true, min: 0},
        avgCost: {type: Number, required: true, min: 0},
    },
    {_id: false},
);

const PaperAccountSchema = new Schema<PaperAccountDoc>(
    {
        userId: {type: String, required: true, unique: true, index: true},
        cash: {type: Number, required: true},
        startingBalance: {type: Number, required: true},
        positions: {type: [PaperPositionSchema], default: []},
    },
    {timestamps: true},
);

const PaperAccount = models?.PaperAccount || model<PaperAccountDoc>('PaperAccount', PaperAccountSchema);

export default PaperAccount;
