import {Document, model, models, Schema} from "mongoose";

// One row per live picker profile (lib/culture/config.ts CULTURE_PROFILES): the shared paper
// account it trades, its launch, and the week it last claimed — the atomic weekly budget, as
// the Navigator's enrollment keys its runs. The version and the catalog fingerprint say when
// the backtest must be rebuilt.
export interface CultureStateDoc extends Document {
    key: string;                  // the profile id: 'spike' | 'quiet'
    accountId: string;            // String(_id) of the PaperAccount under CULTURE_OWNER_ID
    status: 'active' | 'paused';
    launchDate: string;           // 'YYYY-MM-DD' ET
    lastRunWeek?: string;         // the Monday of the last claimed week
    lastRunDate?: string;
    lastTradeDate?: string;
    version: string;              // CULTURE_ENGINE_VERSION at the last run
    catalogHash: string;          // catalogHash() at the last run
    lastError?: string;
}

const CultureStateSchema = new Schema<CultureStateDoc>({
    key: {type: String, required: true},
    accountId: {type: String, required: true},
    status: {type: String, enum: ['active', 'paused'], default: 'active'},
    launchDate: {type: String, required: true},
    lastRunWeek: {type: String},
    lastRunDate: {type: String},
    lastTradeDate: {type: String},
    version: {type: String, default: ''},
    catalogHash: {type: String, default: ''},
    lastError: {type: String},
});

CultureStateSchema.index({key: 1}, {unique: true});

const CultureState = models?.CultureState || model<CultureStateDoc>('CultureState', CultureStateSchema);

export default CultureState;
