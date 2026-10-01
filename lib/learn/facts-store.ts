// Server reads behind the learn surfaces. A plain module (not 'use server') so nothing
// here is a POST endpoint; callers derive the userId from the session. cache()-wrapped
// so the dashboard page (which needs the answer for widget availability) and the
// widget's own loader share one set of reads per request. cache() shares nothing outside a
// render, so the daily digest job reads through readLearnFacts, which reads the accounts and
// the preferences once and hands them to both builders.
//
// Every read is an existence check, a projection or a single indexed row — no bar reads,
// no quotes, and never the lazy account-creation path (readAccountsForUser answers a
// question, it does not open an account).

import {cache} from "react";
import {connectToDatabase} from "@/database/mongoose";
import AccountIncome from "@/database/models/account-income.model";
import AccountSnapshot from "@/database/models/account-snapshot.model";
import AiNavigator from "@/database/models/ai-navigator.model";
import PaperTrade from "@/database/models/paper-trade.model";
import StrategyState from "@/database/models/strategy-state.model";
import Topic from "@/database/models/topic.model";
import UserPreferencesModel from "@/database/models/user-preferences.model";
import Watchlist from "@/database/models/watchlist.model";
import {readAccountsForUser} from "@/lib/trading/account";
import {addCalendarDays, getEasternDateString} from "@/lib/dates";
import {daysBetween, type LearnDividend, type LearnFacts, type LearnFill, type LearnRebalance, type LearnSell, type OnboardingFacts} from "@/lib/learn/facts";
import {ONBOARDING_MAX_DAYS} from "@/lib/learn/missions";
import {firstDrawdownCrossing} from "@/lib/learn/moments";
import {STRATEGY_SLUGS} from "@/lib/strategies/catalog";
import type {StrategyId} from "@/lib/strategies/types";

type LearnPrefs = {followedStrategies?: string[]; learn?: {missionsDismissedAt?: Date; lessonsSeen?: string[]}} | null;
type LearnRows = {accounts: Awaited<ReturnType<typeof readAccountsForUser>>; prefs: LearnPrefs};

const readRowsNow = async (userId: string): Promise<LearnRows> => {
    await connectToDatabase();
    const [accounts, prefs] = await Promise.all([
        readAccountsForUser(userId),
        UserPreferencesModel.findOne({userId}).select('followedStrategies learn').lean<LearnPrefs>(),
    ]);
    return {accounts, prefs};
};
// Shared by both fact readers, so the page's availability check and the widget's loader
// read the accounts and the preferences once per request.
const readRows = cache(readRowsNow);

const onboardingFrom = async (userId: string, {accounts, prefs}: LearnRows): Promise<OnboardingFacts> => {
    await connectToDatabase();
    const [trade, topic, watch, navigator] = await Promise.all([
        PaperTrade.exists({userId, source: 'user'}),
        Topic.exists({userId, lastSeenAt: {$exists: true}}),
        Watchlist.exists({userId}),
        AiNavigator.exists({userId}),
    ]);
    const oldest = accounts.length > 0 ? accounts[0].createdAt : null;
    const dismissed = prefs?.learn?.missionsDismissedAt;
    return {
        today: getEasternDateString(),
        accountCreatedOn: oldest ? getEasternDateString(new Date(oldest)) : null,
        hasUserTrade: trade !== null,
        followedStrategies: prefs?.followedStrategies ?? [],
        topicOpened: topic !== null,
        hasWatchlist: watch !== null,
        navigatorEnrolled: navigator !== null,
        missionsDismissedAt: dismissed ? new Date(dismissed).toISOString() : null,
    };
};

export const getOnboardingFacts = cache(async (userId: string): Promise<OnboardingFacts> => onboardingFrom(userId, await readRows(userId)));

type LeanFill = {symbol: string; side: 'buy' | 'sell'; quantity: number; price: number; realizedPnl?: number | null; createdAt: Date};
type LeanDividend = {symbol: string; date: string; amount: number; perShare?: number; quantity?: number; exDate?: string};
type LeanState = {strategyId: string; lastRebalanceDate?: string; lastTradeDate?: string};

const isStrategyId = (value: string): value is StrategyId => (STRATEGY_SLUGS as readonly string[]).includes(value);

// What Today's lesson reads on top of the onboarding facts. After the (shared) account and
// preference reads, every query runs in one Promise.all:
// - the first user fill on the {userId, source, createdAt} index, the first user sell on
//   {userId, source, side, createdAt} — each one index probe;
// - the first dividend credited within each account's watermark (incomeThrough), for the
//   account's current epoch — inceptionAt, falling back to createdAt for accounts from before
//   inceptionAt existed, as getIncomeActivity reads it;
// - the drawdown scan: only accounts younger than ONBOARDING_MAX_DAYS, projected to three
//   fields and dated on or after the same cutoff, so it can never grow into a history read
//   (the digest needs it too: a first drawdown crossed yesterday is a moment it mails);
// - the followed strategies' StrategyState rows (eight at most) for their last check.
// The rows' read has connected; the onboarding promise is joined before anything else awaits.
const learnFactsFrom = async (userId: string, {accounts, prefs}: LearnRows, onboardingFacts: Promise<OnboardingFacts>): Promise<LearnFacts> => {
    const followed = (prefs?.followedStrategies ?? []).filter(isStrategyId);
    const today = getEasternDateString();
    const cutoff = addCalendarDays(today, -ONBOARDING_MAX_DAYS);
    const young = accounts.filter((a) => daysBetween(getEasternDateString(new Date(a.createdAt)), today) <= ONBOARDING_MAX_DAYS);
    const credited = accounts.filter((a) => typeof a.incomeThrough === 'string' && a.incomeThrough.length > 0);

    const [onboarding, fill, sell, dividend, snapshots, states] = await Promise.all([
        onboardingFacts,
        PaperTrade.findOne({userId, source: 'user'}).sort({createdAt: 1}).select('symbol side quantity price createdAt').lean<LeanFill | null>(),
        PaperTrade.findOne({userId, source: 'user', side: 'sell'}).sort({createdAt: 1}).select('symbol side quantity price realizedPnl createdAt').lean<LeanFill | null>(),
        credited.length === 0 ? null : AccountIncome.findOne({
            $or: credited.map((a) => ({
                accountId: String(a._id),
                epoch: new Date(a.inceptionAt || a.createdAt).getTime(),
                kind: 'dividend',
                date: {$lte: a.incomeThrough},
            })),
        }).sort({date: 1}).select('symbol date amount perShare quantity exDate').lean<LeanDividend | null>(),
        young.length === 0 ? [] : AccountSnapshot.find({accountId: {$in: young.map((a) => String(a._id))}, date: {$gte: cutoff}})
            .select('accountId date totalValue').lean<{accountId: string; date: string; totalValue: number}[]>(),
        followed.length === 0 ? [] : StrategyState.find({strategyId: {$in: followed}}).select('strategyId lastRebalanceDate lastTradeDate').lean<LeanState[]>(),
    ]);

    const rebalances: LearnRebalance[] = states
        .filter((s) => isStrategyId(s.strategyId) && typeof s.lastRebalanceDate === 'string')
        .map((s) => ({strategyId: s.strategyId as StrategyId, date: s.lastRebalanceDate as string, traded: s.lastTradeDate === s.lastRebalanceDate}));

    return {
        ...onboarding,
        firstFill: fill ? toFill(fill) : null,
        firstSell: sell ? toSell(sell) : null,
        firstDividend: dividend ? toDividend(dividend) : null,
        firstDrawdown: firstDrawdownCrossing(snapshots.map((s) => ({accountId: String(s.accountId), date: s.date, totalValue: s.totalValue}))),
        rebalances,
        lessonsSeen: prefs?.learn?.lessonsSeen ?? [],
    };
};

export const getLearnFacts = cache(async (userId: string): Promise<LearnFacts> =>
    learnFactsFrom(userId, await readRows(userId), getOnboardingFacts(userId)));

// The digest job's reader (no render, so no cache() sharing): the accounts and the preferences
// are read once and handed to the onboarding and the lesson builders alike.
export const readLearnFacts = async (userId: string): Promise<LearnFacts> => {
    const rows = await readRowsNow(userId);
    return learnFactsFrom(userId, rows, onboardingFrom(userId, rows));
};

const toFill = (t: LeanFill): LearnFill => ({
    date: getEasternDateString(new Date(t.createdAt)),
    symbol: t.symbol,
    side: t.side,
    quantity: t.quantity,
    price: t.price,
});

const toSell = (t: LeanFill): LearnSell => ({
    date: getEasternDateString(new Date(t.createdAt)),
    symbol: t.symbol,
    quantity: t.quantity,
    price: t.price,
    realizedPnl: typeof t.realizedPnl === 'number' ? t.realizedPnl : null,
});

const toDividend = (row: LeanDividend): LearnDividend => ({
    date: row.date,
    symbol: row.symbol,
    amount: row.amount,
    perShare: typeof row.perShare === 'number' ? row.perShare : null,
    quantity: typeof row.quantity === 'number' ? row.quantity : null,
    exDate: row.exDate ?? null,
});
