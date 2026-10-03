import {Document, model, models, Schema} from "mongoose";

// One finished round of a timed or scored game (lib/games/rounds.ts lists them). The client counts
// the round; lib/actions/games.actions.recordGameRound checks it against the game's bounds before
// it is kept. A record is the reader's own top score per game and settings key, read from these
// rows (lib/games/store.ts) — never stored on its own.
export interface GameRoundDoc extends Document {
    userId: string;
    game: string;          // lib/games/rounds GameId
    key: string;           // the settings a record is kept under ("zetamac", "interview", …)
    score: number;
    wrong: number;
    durationMs: number;
    detail: Record<string, number>;   // small per-game counts (per operation, per kind)
    day: string;           // the ET day the round finished
    finishedAt: Date;
}

const GameRoundSchema = new Schema<GameRoundDoc>({
    userId: {type: String, required: true},
    game: {type: String, required: true},
    key: {type: String, required: true},
    score: {type: Number, required: true},
    wrong: {type: Number, required: true, default: 0},
    durationMs: {type: Number, required: true},
    detail: {type: Schema.Types.Mixed, default: {}},
    day: {type: String, required: true},
    finishedAt: {type: Date, required: true},
});

// Recent rounds of one game and key, newest first; and the top score (either end, by the game).
GameRoundSchema.index({userId: 1, game: 1, key: 1, finishedAt: -1});
GameRoundSchema.index({userId: 1, game: 1, key: 1, score: -1});

const GameRound = models?.GameRound || model<GameRoundDoc>('GameRound', GameRoundSchema);

export default GameRound;
