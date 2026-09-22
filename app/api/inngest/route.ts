import {serve} from "inngest/next";
import {inngest} from "@/lib/inngest/client";
import {
    bootstrapAiNavigator,
    fillFirstRunTopics,
    generateSecondOpinion,
    generateTopicBriefs,
    recordDailySnapshots,
    refreshTopicFeeds,
    refreshTopicOnDemand,
    runStrategiesDaily,
    runWeeklyNavigator,
    sendDailyNewsSummary,
    sendSignUpEmail,
    updateNewsBrain,
} from "@/lib/inngest/functions";

// A 12-symbol price chunk with provider spacing, first-run bulk writes and
// fallbacks runs 30–45 s; the default route budget would cut it off.
export const maxDuration = 60;

export const { GET, POST, PUT } = serve({
    client: inngest,
    functions: [
        sendSignUpEmail,
        sendDailyNewsSummary,
        recordDailySnapshots,
        updateNewsBrain,
        runWeeklyNavigator,
        bootstrapAiNavigator,
        generateSecondOpinion,
        refreshTopicFeeds,
        refreshTopicOnDemand,
        fillFirstRunTopics,
        generateTopicBriefs,
        runStrategiesDaily,
    ],
})
