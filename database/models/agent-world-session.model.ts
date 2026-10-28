import {Document, model, models, Schema} from "mongoose";

// One trading agent world session (lib/agent-world): the weekly one, a manual one or a preview. Its
// head is small on purpose — what the floor, the job and the jobs strip read — while each symbol's
// reports, turns and fetches live in its AgentWorldRun. `seq` is the last of the service's events
// applied (the batch write is a compare-and-set on it); `version` moves on every write, the job's
// and the owner's included, and is what the live poll compares. Every row and index carries `env`:
// a preview or a local server sharing production's database keeps sessions of its own. The weekly
// session's id is its week (`aw-<Monday>`), so the unique index is also the week's claim.
export interface AgentWorldSessionDoc extends Document {
    env: 'production' | 'preview' | 'development';
    sessionId: string;
    kind: 'weekly' | 'manual' | 'preview';
    weekKey: string;
    tradeDate: string;
    status: 'queued' | 'running' | 'awaiting-approval' | 'approved' | 'declined' | 'lapsed' | 'completed' | 'failed';
    approval: 'owner' | 'auto';
    source: 'schedule' | 'owner' | 'paperclip';
    requestedBy: string | null;
    accountId: string;
    symbols: string[];
    seq: number;
    version: number;
    current: {symbol: string; index: number} | null;
    runs: {symbol: string; status: string; rating: string | null; review: boolean; costCents: number}[];
    orders: {symbol: string; side: 'buy' | 'sell'; quantity: number; reason: string; rating: string; targetWeight: number | null; currentWeight: number}[];
    fills: {symbol: string; side: 'buy' | 'sell'; quantity: number; executed: boolean; price: number | null; message: string | null; at: Date}[];
    decision: {decision: 'approved' | 'declined' | 'lapsed'; by: string | null; at: Date} | null;
    lapseAt: Date | null;
    cost: {totalCents: number; tokensIn: number; tokensOut: number; llmCalls: number; toolCalls: number};
    paperclip: {issueId: string | null; identifier: string | null; url: string | null; mirrored: boolean | null; note: string | null};
    limits: {provider: string; status: number; message: string; fatal: boolean; at: Date; symbol: string | null}[];
    service: {outcome: string; message: string} | null;
    models: {provider: string; quick: string; deep: string} | null;
    dropped: number;
    note: string | null;
    engineVersion: string;
    startedAt: Date | null;
    finishedAt: Date | null;
    serviceFinishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

const AgentWorldSessionSchema = new Schema<AgentWorldSessionDoc>({
    env: {type: String, enum: ['production', 'preview', 'development'], required: true},
    sessionId: {type: String, required: true},
    kind: {type: String, enum: ['weekly', 'manual', 'preview'], required: true},
    weekKey: {type: String, required: true},
    tradeDate: {type: String, required: true},
    status: {type: String, enum: ['queued', 'running', 'awaiting-approval', 'approved', 'declined', 'lapsed', 'completed', 'failed'], required: true},
    approval: {type: String, enum: ['owner', 'auto'], required: true},
    source: {type: String, enum: ['schedule', 'owner', 'paperclip'], default: 'schedule'},
    requestedBy: {type: String, default: null},
    accountId: {type: String, required: true},
    symbols: {type: [String], default: []},
    seq: {type: Number, default: 0},
    version: {type: Number, default: 0},
    // The nested heads below are written whole (the batch write folds them in memory), so they are
    // left schemaless: no default can collide with an update's own path.
    current: {type: Schema.Types.Mixed, default: null},
    runs: {type: Schema.Types.Mixed, default: []},
    orders: {type: Schema.Types.Mixed, default: []},
    fills: {type: Schema.Types.Mixed, default: []},
    decision: {type: Schema.Types.Mixed, default: null},
    lapseAt: {type: Date, default: null},
    cost: {type: Schema.Types.Mixed, default: () => ({totalCents: 0, tokensIn: 0, tokensOut: 0, llmCalls: 0, toolCalls: 0})},
    paperclip: {type: Schema.Types.Mixed, default: () => ({issueId: null, identifier: null, url: null, mirrored: null, note: null})},
    limits: {type: Schema.Types.Mixed, default: []},
    service: {type: Schema.Types.Mixed, default: null},
    models: {type: Schema.Types.Mixed, default: null},
    dropped: {type: Number, default: 0},
    note: {type: String, default: null},
    engineVersion: {type: String, required: true},
    startedAt: {type: Date, default: null},
    finishedAt: {type: Date, default: null},
    serviceFinishedAt: {type: Date, default: null},
}, {timestamps: true});

AgentWorldSessionSchema.index({env: 1, sessionId: 1}, {unique: true});
AgentWorldSessionSchema.index({env: 1, createdAt: -1});
AgentWorldSessionSchema.index({env: 1, status: 1, createdAt: -1});

const AgentWorldSession = models?.AgentWorldSession || model<AgentWorldSessionDoc>('AgentWorldSession', AgentWorldSessionSchema);

export default AgentWorldSession;
