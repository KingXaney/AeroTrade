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
    runWeeklyNavigator,
    sendDailyNewsSummary,
    sendSignUpEmail,
    updateNewsBrain,
} from "@/lib/inngest/functions";


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
    ],
})
