import {Document, model, models, Schema} from "mongoose";

// The owner's Alpaca link (lib/broker; docs/specs/2026-10-24-alpaca-broker-link.md): which of
// their paper accounts the Alpaca account mirrors, whether the mirror is on, and its last syncs
// (newest first, MIRROR_SYNCS_KEPT of them) — each sync's orders as sent and how Alpaca answered.
// One per user; the keys are the server's environment, never stored.

export interface BrokerSyncOrderDoc {
    symbol: string;
    side: 'buy' | 'sell';
    notional?: number;
    qty?: number;
    reason: 'enter' | 'add' | 'trim' | 'exit';
    clientOrderId: string;
    sent: boolean;               // false in a preview
    ok: boolean;                 // Alpaca accepted it (or had it already)
    status?: string;             // Alpaca's order status at the answer
    error?: string;
}

export interface BrokerSyncDoc {
    day: string;                 // 'YYYY-MM-DD' ET
    at: Date;
    kind: 'executed' | 'preview' | 'skipped';
    summary: string;
    orders: BrokerSyncOrderDoc[];
    skipped: {symbol: string; reason: string}[];
}

export interface BrokerLinkDoc extends Document {
    userId: string;
    provider: 'alpaca';
    sourceAccountId: string;
    status: 'active' | 'paused';
    syncs: BrokerSyncDoc[];
    createdAt: Date;
    updatedAt: Date;
}

const OrderSchema = new Schema<BrokerSyncOrderDoc>({
    symbol: {type: String, required: true},
    side: {type: String, required: true, enum: ['buy', 'sell']},
    notional: {type: Number},
    qty: {type: Number},
    reason: {type: String, required: true, enum: ['enter', 'add', 'trim', 'exit']},
    clientOrderId: {type: String, required: true},
    sent: {type: Boolean, default: false},
    ok: {type: Boolean, default: false},
    status: {type: String},
    error: {type: String},
}, {_id: false});

const SyncSchema = new Schema<BrokerSyncDoc>({
    day: {type: String, required: true},
    at: {type: Date, required: true},
    kind: {type: String, required: true, enum: ['executed', 'preview', 'skipped']},
    summary: {type: String, default: ''},
    orders: {type: [OrderSchema], default: []},
    skipped: {type: [new Schema({symbol: {type: String, required: true}, reason: {type: String, required: true}}, {_id: false})], default: []},
}, {_id: false});

const BrokerLinkSchema = new Schema<BrokerLinkDoc>({
    userId: {type: String, required: true},
    provider: {type: String, required: true, enum: ['alpaca'], default: 'alpaca'},
    sourceAccountId: {type: String, required: true},
    status: {type: String, required: true, enum: ['active', 'paused'], default: 'active'},
    syncs: {type: [SyncSchema], default: []},
}, {timestamps: true});

BrokerLinkSchema.index({userId: 1}, {unique: true});
BrokerLinkSchema.index({status: 1});

const BrokerLink = models?.BrokerLink || model<BrokerLinkDoc>('BrokerLink', BrokerLinkSchema);

export default BrokerLink;
