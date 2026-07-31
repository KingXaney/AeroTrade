'use server';

import SecondOpinion from "@/database/models/second-opinion.model";
import {connectToDatabase} from "@/database/mongoose";
import {getCurrentUserId} from "@/lib/actions/watchlist.actions";
import {inngest} from "@/lib/inngest/client";
import {isSecondOpinionConfigured, SECOND_OPINION_MIN_INTERVAL_MS} from "@/lib/brain/opinion";

// Queue a fresh Claude read of the brain. It's a paid API behind a button, so
// it sits behind a session and a cool-down that stops the button being hammered
// into a bill.
export const requestSecondOpinion = async (): Promise<OrderResult> => {
    try {
        const userId = await getCurrentUserId();
        if (!userId) return {success: false, message: 'Not authenticated'};
        if (!isSecondOpinionConfigured()) {
            return {success: false, message: 'Claude is not connected — set ANTHROPIC_API_KEY to enable second opinions'};
        }

        await connectToDatabase();
        const latest = await SecondOpinion.findOne({scope: 'global'}).lean<{generatedAt: Date}>();
        if (latest) {
            const ageMs = Date.now() - new Date(latest.generatedAt).getTime();
            if (ageMs < SECOND_OPINION_MIN_INTERVAL_MS) {
                const waitMin = Math.ceil((SECOND_OPINION_MIN_INTERVAL_MS - ageMs) / 60000);
                return {success: false, message: `The current opinion is fresh — ask again in about ${waitMin} min`};
            }
        }

        await inngest.send({name: 'app/generate.second.opinion', data: {userId}});
        return {success: true, message: 'Claude is reading the brain — the opinion appears here in a minute or two'};
    } catch (error) {
        console.error('Error requesting second opinion:', error);
        return {success: false, message: 'Could not queue the request — is the job queue reachable?'};
    }
};
