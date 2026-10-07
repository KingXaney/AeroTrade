// Every Inngest function app/api/inngest/route.ts serves, one file per feature beside this one.
// Each file holds thin createFunction wrappers: the triggers come from lib/jobs/registry.ts and
// the step bodies from the feature's own module.

import {creditDailyIncome} from "@/lib/jobs/functions/income";
import {generateSecondOpinion, updateNewsBrain} from "@/lib/jobs/functions/brain";
import {bootstrapAiNavigator, runWeeklyNavigator} from "@/lib/jobs/functions/navigator";
import {sendDailyNewsSummary, sendSignUpEmail} from "@/lib/jobs/functions/email";
import {recordDailySnapshots} from "@/lib/jobs/functions/trading";
import {fillFirstRunTopics, generateTopicBriefs, refreshTopicFeeds, refreshTopicOnDemand} from "@/lib/jobs/functions/topics";
import {runStrategiesDaily} from "@/lib/jobs/functions/strategies";
import {generateMarketBriefing} from "@/lib/jobs/functions/news";
import {backfillCultureWikipedia, runCultureWeekly, updateCultureBrain} from "@/lib/jobs/functions/culture";

export const functions = [
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
    creditDailyIncome,
    generateMarketBriefing,
    updateCultureBrain,
    runCultureWeekly,
    backfillCultureWikipedia,
];
