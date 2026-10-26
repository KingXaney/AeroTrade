// Enrolments with the culture pickers, the DB halves (NOT a 'use server' module): the rows, the
// atomic weekly claim per enrolment, an enrolled account's decisions, and the reads the culture
// page, the portfolio page, the widget, the email and the chat make. The account itself is the
// user's own PaperAccount; its fills go through lib/trading/orders.executeOrder as every fill does.

import CultureFollow from "@/database/models/culture-follow.model";
import CultureFollowDecision, {type CultureFollowDecisionDoc} from "@/database/models/culture-follow-decision.model";
import PaperAccount from "@/database/models/paper-account.model";
import {connectToDatabase} from "@/database/mongoose";
import type {ProfileId} from "@/lib/culture/config";
import {copyDecisionItem, type CultureDecisionItem} from "@/lib/culture/decisions";
import type {FollowRow} from "@/lib/culture/follow";
import type {OutcomeRecord} from "@/lib/culture/picker-store";

// More enrolments than one picker will ever have; the weekly loop is bounded by it.
const FOLLOWERS_READ_LIMIT = 200;

type LeanFollow = {userId: string; profile: string; accountId: string; status: 'active' | 'paused'; enrolledAt: Date; lastRunWeek?: string; lastError?: string};

const toRow = (doc: LeanFollow): FollowRow => ({
    userId: doc.userId,
    profile: doc.profile as ProfileId,
    accountId: doc.accountId,
    status: doc.status,
    enrolledAt: new Date(doc.enrolledAt),
    lastRunWeek: doc.lastRunWeek ?? null,
    lastError: doc.lastError ?? null,
});

export const getFollows = async (userId: string): Promise<FollowRow[]> => {
    await connectToDatabase();
    return (await CultureFollow.find({userId}).lean<LeanFollow[]>()).map(toRow);
};

export const getFollow = async (userId: string, profile: ProfileId): Promise<FollowRow | null> => {
    await connectToDatabase();
    const doc = await CultureFollow.findOne({userId, profile}).lean<LeanFollow | null>();
    return doc ? toRow(doc) : null;
};

export const getFollowByAccount = async (userId: string, accountId: string): Promise<FollowRow | null> => {
    await connectToDatabase();
    const doc = await CultureFollow.findOne({userId, accountId}).lean<LeanFollow | null>();
    return doc ? toRow(doc) : null;
};

export const listActiveFollowers = async (profile: ProfileId): Promise<FollowRow[]> => {
    await connectToDatabase();
    return (await CultureFollow.find({profile, status: 'active'}).sort({enrolledAt: 1}).limit(FOLLOWERS_READ_LIMIT).lean<LeanFollow[]>()).map(toRow);
};

export const createFollow = async (userId: string, profile: ProfileId, accountId: string): Promise<FollowRow> => {
    await connectToDatabase();
    const doc = await CultureFollow.create({userId, profile, accountId, status: 'active', enrolledAt: new Date()});
    return toRow(doc.toObject() as LeanFollow);
};

export const setFollowStatus = async (userId: string, profile: ProfileId, status: 'active' | 'paused'): Promise<boolean> => {
    await connectToDatabase();
    return (await CultureFollow.updateOne({userId, profile}, {$set: {status}})).matchedCount === 1;
};

export const removeFollow = async (userId: string, profile: ProfileId): Promise<boolean> => {
    await connectToDatabase();
    return (await CultureFollow.deleteOne({userId, profile})).deletedCount === 1;
};

// The week's atomic claim per enrolment: the bootstrap and the weekly run both call it, and the
// second to ask in a week finds it taken. A paused enrolment is never claimed.
export const claimFollowWeek = async (userId: string, profile: ProfileId, weekKey: string): Promise<boolean> => {
    await connectToDatabase();
    const doc = await CultureFollow.findOneAndUpdate(
        {userId, profile, status: 'active', lastRunWeek: {$ne: weekKey}},
        {$set: {lastRunWeek: weekKey}},
    );
    return doc !== null;
};

// An enrolled account's claim on a void week let go with its picker's, when nothing filled in
// that account that week: the re-decided week reaches it too. A week it traded in stays claimed.
export const releaseIdleFollowWeek = async (userId: string, profile: ProfileId, weekKey: string): Promise<boolean> => {
    await connectToDatabase();
    const traded = await CultureFollowDecision.exists({userId, profile, weekKey, 'items.executed': true});
    if (traded) return false;
    const result = await CultureFollow.updateOne({userId, profile, lastRunWeek: weekKey}, {$unset: {lastRunWeek: ''}});
    return result.modifiedCount === 1;
};

export const completeFollowRun = async ({userId, profile, outcomes}: {userId: string; profile: ProfileId; outcomes: readonly OutcomeRecord[]}): Promise<void> => {
    await connectToDatabase();
    const failed = outcomes.filter((o) => !o.executed);
    await CultureFollow.updateOne(
        {userId, profile},
        failed.length > 0
            ? {$set: {lastError: `${failed.length} of ${outcomes.length} order(s) failed: ${failed.map((o) => `${o.side} ${o.symbol} — ${o.message ?? 'unknown'}`).join('; ')}`.slice(0, 500)}}
            : {$unset: {lastError: ''}},
    );
};

// Every symbol the given accounts hold, for the week's quote sweep: an enrolled account's
// holding must be priced for its exit to be seen.
export const getHeldSymbolsForAccounts = async (accountIds: readonly string[]): Promise<string[]> => {
    if (accountIds.length === 0) return [];
    await connectToDatabase();
    const accounts = await PaperAccount.find({_id: {$in: accountIds}}).select({positions: 1}).lean<{positions?: {symbol: string}[]}[]>();
    return [...new Set(accounts.flatMap((a) => (a.positions ?? []).map((p) => p.symbol.toUpperCase())))];
};

// ---- the decisions ----

export type FollowDecisionView = {
    profile: ProfileId;
    accountId: string;
    date: string;
    weekKey: string;
    kind: 'executed' | 'preview';
    items: CultureDecisionItem[];
    summary: string;
};

export type FollowDecisionInput = Omit<FollowDecisionView, 'items'> & {userId: string; items: readonly CultureDecisionItem[]};

const toView = (doc: CultureFollowDecisionDoc): FollowDecisionView => ({
    profile: doc.profile as ProfileId,
    accountId: doc.accountId,
    date: doc.date,
    weekKey: doc.weekKey,
    kind: doc.kind,
    items: doc.items.map((item) => copyDecisionItem(item as CultureDecisionItem)),
    summary: doc.summary,
});

// A preview never overwrites the record of trades executed that day.
export const saveFollowDecision = async (input: FollowDecisionInput): Promise<boolean> => {
    await connectToDatabase();
    const key = {userId: input.userId, profile: input.profile, date: input.date};
    const existing = await CultureFollowDecision.findOne(key).lean<{kind: string} | null>();
    if (existing && existing.kind === 'executed' && input.kind !== 'executed') return false;
    await CultureFollowDecision.updateOne(
        key,
        {$set: {accountId: input.accountId, weekKey: input.weekKey, kind: input.kind, items: [...input.items], summary: input.summary}, $setOnInsert: {createdAt: new Date()}},
        {upsert: true},
    );
    return true;
};

export const getLatestFollowDecision = async (userId: string, profile: ProfileId): Promise<FollowDecisionView | null> => {
    await connectToDatabase();
    const doc = await CultureFollowDecision.findOne({userId, profile}).sort({date: -1});
    return doc ? toView(doc) : null;
};

// The latest executed decision per enrolled picker, for the daily email and the chat.
export const getLatestFollowDecisions = async (userId: string): Promise<FollowDecisionView[]> => {
    const follows = await getFollows(userId);
    const out: FollowDecisionView[] = [];
    for (const follow of follows) {
        const doc = await CultureFollowDecision.findOne({userId, profile: follow.profile, kind: 'executed'}).sort({date: -1});
        if (doc) out.push(toView(doc));
    }
    return out;
};

// An enrolled account's decisions on the given days, for its trade log's "What the picker saw".
export const getFollowDecisionsForDates = async (userId: string, profile: ProfileId, dates: readonly string[]): Promise<FollowDecisionView[]> => {
    const distinct = [...new Set(dates)];
    if (distinct.length === 0) return [];
    await connectToDatabase();
    return (await CultureFollowDecision.find({userId, profile, date: {$in: distinct}})).map(toView);
};
