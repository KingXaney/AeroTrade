import {Document, model, models, Schema} from "mongoose";

export interface PaperTradeDoc extends Document {
    userId: string;
    symbol: string;
    company: string;
    side: 'buy' | 'sell';
    quantity: number;
    price: number;
    total: number;
    realizedPnl?: number;
    createdAt: Date;
}

const PaperTradeSchema = new Schema<PaperTradeDoc>({
    userId: {type: String, required: true, index: true},
    symbol: {type: String, required: true, uppercase: true, trim: true},
    company: {type: String, default: ''},
    side: {type: String, required: true, enum: ['buy', 'sell']},
    quantity: {type: Number, required: true, min: 0},
    price: {type: Number, required: true, min: 0},
    total: {type: Number, required: true},
    realizedPnl: {type: Number},
    createdAt: {type: Date, default: Date.now, index: true},
});

const PaperTrade = models?.PaperTrade || model<PaperTradeDoc>('PaperTrade', PaperTradeSchema);

export default PaperTrade;
