// Server reads behind the learn surfaces. A plain module (not 'use server') so nothing
// here is a POST endpoint; callers derive the userId from the session. cache()-wrapped
// so the dashboard page (which needs the answer for widget availability) and the
// widget's own loader share one set of reads per request.
//
// Every read is an existence check or a projection — no bar reads, no quotes, and
// never the lazy account-creation path (readAccountsForUser answers a question, it
// does not open an account).

import {cache} from "react";
import {connectToDatabase} from "@/database/mongoose";
import AiNavigator from "@/database/models/ai-navigator.model";
import PaperTrade from "@/database/models/paper-trade.model";
import Topic from "@/database/models/topic.model";
import UserPreferencesModel from "@/database/models/user-preferences.model";
import Watchlist from "@/database/models/watchlist.model";
import {readAccountsForUser} from "@/lib/trading/account";
import {getEasternDateString} from "@/lib/utils";
import type {OnboardingFacts} from "@/lib/learn/facts";

type LearnPrefs = {followedStrategies?: string[]; learn?: {missionsDismissedAt?: Date}} | null;

export const getOnboardingFacts = cache(async (userId: string): Promise<OnboardingFacts> => {
    await connectToDatabase();
    const [accounts, trade, prefs, topic, watch, navigator] = await Promise.all([
        readAccountsForUser(userId),
        PaperTrade.exists({userId, source: 'user'}),
        UserPreferencesModel.findOne({userId}).select('followedStrategies learn').lean<LearnPrefs>(),
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
});
