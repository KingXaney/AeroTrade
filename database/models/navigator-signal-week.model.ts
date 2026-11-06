import {Document, model, models, Schema} from "mongoose";

// One row per ET week the AI Navigator scored its universe: every symbol's terms as scoreUniverse
// read them, the score it gave and whether it could be bought — the cross-section the weekly
// decision chose from, which the decision itself keeps only for its picks. The signal check
// (lib/navigator/signal-check) sets each term's ranking beside the returns that followed.
// Written by the weekly job's scoring step only (lib/navigator/store.computeNavigatorScores);
// research log R1, docs/research/log.md.
export interface NavigatorSignalSymbol {
    symbol: string;
    newsWeightSlow: number | null;   // null: the brain has no entity for it
    sentimentSlow: number | null;    // null with no entity
    r63: number | null;
    r126: number | null;
    r252: number | null;
    sectorTilt: number | null;       // null: no sector attribution
    thesis: boolean;
    score: number;
    eligible: boolean;
}

export interface NavigatorSignalWeekDoc extends Document {
    weekKey: string;                 // the ET week (lib/dates getEasternWeekKey)
    date: string;                    // the ET date the week was scored and traded
    symbols: NavigatorSignalSymbol[];
    createdAt: Date;
}

const SymbolSchema = new Schema<NavigatorSignalSymbol>(
    {
        symbol: {type: String, required: true},
        newsWeightSlow: {type: Number, default: null},
        sentimentSlow: {type: Number, default: null},
        r63: {type: Number, default: null},
        r126: {type: Number, default: null},
        r252: {type: Number, default: null},
        sectorTilt: {type: Number, default: null},
        thesis: {type: Boolean, default: false},
        score: {type: Number, required: true},
        eligible: {type: Boolean, required: true},
    },
    {_id: false},
);

const NavigatorSignalWeekSchema = new Schema<NavigatorSignalWeekDoc>({
    weekKey: {type: String, required: true},
    date: {type: String, required: true},
    symbols: {type: [SymbolSchema], default: []},
    createdAt: {type: Date, default: Date.now},
});

NavigatorSignalWeekSchema.index({weekKey: 1}, {unique: true});

const NavigatorSignalWeek = models?.NavigatorSignalWeek || model<NavigatorSignalWeekDoc>('NavigatorSignalWeek', NavigatorSignalWeekSchema);

export default NavigatorSignalWeek;
