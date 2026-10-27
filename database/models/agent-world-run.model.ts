import {Document, model, models, Schema} from "mongoose";

// One symbol's run within a trading agent world session: each role's stage (when it started and
// finished, its model calls and cost), the reports as filed, the debate and the risk desk's turns,
// every data fetch and its vendor, the rating. Written one event at a time by the events route
// (lib/agent-world/store.ts applyEventBatch), each update filtered on `seq` below the event's, so a
// retried batch changes nothing. Turns and fetches are capped arrays; the texts are cut to the
// clamps in lib/agent-world/config.ts before they arrive here. `stages`, `reports`, `cost` and
// `extraCost` are keyed by role and incremented in place, so they carry no schema or default that
// could collide with an update's own path.
export interface AgentWorldRunDoc extends Document {
    env: 'production' | 'preview' | 'development';
    sessionId: string;
    symbol: string;
    index: number;
    status: 'pending' | 'running' | 'completed' | 'failed';
    seq: number;
    rating: string | null;
    review: boolean;
    decision: string | null;
    stats: Record<string, number> | null;
    stages: Record<string, unknown>;
    reports: Record<string, string>;
    debate: unknown[];
    risk: unknown[];
    tools: unknown[];
    toolResults: unknown[];
    cost: Record<string, number>;
    extraCost: Record<string, number>;
    memoryNote: string | null;
    failure: {reason: string; message: string} | null;
    startedAt: Date | null;
    finishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

const AgentWorldRunSchema = new Schema<AgentWorldRunDoc>({
    env: {type: String, enum: ['production', 'preview', 'development'], required: true},
    sessionId: {type: String, required: true},
    symbol: {type: String, required: true},
    index: {type: Number},
    status: {type: String, enum: ['pending', 'running', 'completed', 'failed']},
    seq: {type: Number},
    rating: {type: String},
    review: {type: Boolean},
    decision: {type: String},
    stats: {type: Schema.Types.Mixed},
    stages: {type: Schema.Types.Mixed},
    reports: {type: Schema.Types.Mixed},
    debate: {type: [Schema.Types.Mixed], default: undefined},
    risk: {type: [Schema.Types.Mixed], default: undefined},
    tools: {type: [Schema.Types.Mixed], default: undefined},
    toolResults: {type: [Schema.Types.Mixed], default: undefined},
    cost: {type: Schema.Types.Mixed},
    extraCost: {type: Schema.Types.Mixed},
    memoryNote: {type: String},
    failure: {type: Schema.Types.Mixed},
    startedAt: {type: Date},
    finishedAt: {type: Date},
}, {timestamps: true});

AgentWorldRunSchema.index({env: 1, sessionId: 1, symbol: 1}, {unique: true});
AgentWorldRunSchema.index({env: 1, sessionId: 1, seq: 1});

const AgentWorldRun = models?.AgentWorldRun || model<AgentWorldRunDoc>('AgentWorldRun', AgentWorldRunSchema);

export default AgentWorldRun;
