// Deleting everything a reader stored. Server-only (NOT 'use server'): it takes a user id, so
// it is reachable only through the auth library's own delete (lib/auth/server.ts: beforeDelete),
// which has verified the session and the password first.
//
// No transactions (the QA database cannot run them), so the order does the work: whatever
// trades in the reader's accounts goes first, then the books, then the rest, the preferences
// last. A run that stops part-way leaves the account in place — the user row is deleted only
// after this returns — and running it again finishes the job: every step is a deleteMany.

import type {Model} from "mongoose";
import {connectToDatabase} from "@/database/mongoose";
import AccountIncome from "@/database/models/account-income.model";
import AccountSnapshot from "@/database/models/account-snapshot.model";
import AiNavigator from "@/database/models/ai-navigator.model";
import ArithmeticSkill from "@/database/models/arithmetic-skill.model";
import BrokerLink from "@/database/models/broker-link.model";
import CultureFollowDecision from "@/database/models/culture-follow-decision.model";
import CultureFollow from "@/database/models/culture-follow.model";
import DigestSend from "@/database/models/digest-send.model";
import Friendship from "@/database/models/friendship.model";
import GameRound from "@/database/models/game-round.model";
import LabCardState from "@/database/models/lab-card-state.model";
import LabEvent from "@/database/models/lab-event.model";
import PaperAccount from "@/database/models/paper-account.model";
import PaperTrade from "@/database/models/paper-trade.model";
import PokerResult from "@/database/models/poker-result.model";
import PuzzleSolve from "@/database/models/puzzle-solve.model";
import SuggestionSet, {GLOBAL_SUGGESTIONS_USER} from "@/database/models/suggestion-set.model";
import Topic from "@/database/models/topic.model";
import UserPreferences from "@/database/models/user-preferences.model";
import Watchlist from "@/database/models/watchlist.model";
import {USER_DATA, type UserDataModel} from "@/lib/account/user-data";
import {AGENT_WORLD_OWNER_ID} from "@/lib/agent-world/config";
import {CULTURE_OWNER_ID} from "@/lib/culture/config";
import {STRATEGY_OWNER_ID} from "@/lib/strategies/config";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- one deleteMany per model, whatever its document type
type AnyModel = Model<any>;

// Held equal to USER_DATA by the type: a model listed there and missing here does not compile.
export const USER_DATA_MODELS: Record<UserDataModel, AnyModel> = {
    'ai-navigator': AiNavigator,
    'culture-follow': CultureFollow,
    'culture-follow-decision': CultureFollowDecision,
    'broker-link': BrokerLink,
    'paper-trade': PaperTrade,
    'account-snapshot': AccountSnapshot,
    'account-income': AccountIncome,
    'paper-account': PaperAccount,
    'suggestion-set': SuggestionSet,
    'topic': Topic,
    'watchlist': Watchlist,
    'friendship': Friendship,
    'digest-send': DigestSend,
    'game-round': GameRound,
    'puzzle-solve': PuzzleSolve,
    'arithmetic-skill': ArithmeticSkill,
    'lab-event': LabEvent,
    'lab-card-state': LabCardState,
    'poker-result': PokerResult,
    'user-preferences': UserPreferences,
};

// The system's own owners share these collections with readers. They are never a person, and
// nothing here may delete under one.
const SYSTEM_OWNERS: ReadonlySet<string> = new Set([GLOBAL_SUGGESTIONS_USER, STRATEGY_OWNER_ID, CULTURE_OWNER_ID, AGENT_WORLD_OWNER_ID]);

// Every row the user owns, in USER_DATA's order. Returns how many rows each model lost.
export const deleteUserData = async (userId: string): Promise<Record<string, number>> => {
    if (typeof userId !== 'string' || userId.length === 0 || SYSTEM_OWNERS.has(userId) || userId.startsWith('system:')) {
        throw new Error('deleteUserData: not a reader\'s id');
    }
    await connectToDatabase();
    const deleted: Record<string, number> = {};
    for (const name of Object.keys(USER_DATA) as UserDataModel[]) {
        const fields: readonly string[] = USER_DATA[name];
        const filter = fields.length === 1 ? {[fields[0]]: userId} : {$or: fields.map((field) => ({[field]: userId}))};
        deleted[name] = (await USER_DATA_MODELS[name].deleteMany(filter)).deletedCount ?? 0;
    }
    return deleted;
};
