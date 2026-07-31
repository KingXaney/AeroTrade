'use server';

import {revalidatePath} from "next/cache";
import SecondOpinion from "@/database/models/second-opinion.model";
import {connectToDatabase} from "@/database/mongoose";
import {getCurrentUserId} from "@/lib/actions/watchlist.actions";
import {inngest} from "@/lib/inngest/client";
import {
    gatherOpinionContext,
    isSecondOpinionConfigured,
    MANUAL_MODEL_LABEL,
    saveSecondOpinion,
    SECOND_OPINION_MAX_CHARS,
    SECOND_OPINION_MIN_INTERVAL_MS,
} from "@/lib/brain/opinion";
import {buildStandaloneSecondOpinionPrompt} from "@/lib/brain/prompts";

const MIN_PASTED_CHARS = 40;

// Path 1 — API key configured: queue the background Claude call. Paid, so it
// sits behind a session and a cool-down that stops the button becoming a bill.
export const requestSecondOpinion = async (): Promise<OrderResult> => {
    try {
        const userId = await getCurrentUserId();
        if (!userId) return {success: false, message: 'Not authenticated'};
        if (!isSecondOpinionConfigured()) {
            return {success: false, message: 'No API key set — use the Max-plan options below instead'};
        }

        await connectToDatabase();
        const latest = await SecondOpinion.findOne({scope: userId}).lean<{generatedAt: Date}>();
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

// Path 2 — Max plan, no API key: hand the user the exact prompt to paste into
// claude.ai. Built server-side so the page payload stays small and the wording
// stays identical to what the automated paths send.
export const getSecondOpinionPrompt = async (): Promise<{success: boolean; prompt?: string; message?: string}> => {
    try {
        const userId = await getCurrentUserId();
        if (!userId) return {success: false, message: 'Not authenticated'};

        const context = await gatherOpinionContext();
        if (!Array.isArray(context.narratives) || context.narratives.length === 0) {
            return {success: false, message: 'The brain is empty — run a brain update first'};
        }
        return {success: true, prompt: buildStandaloneSecondOpinionPrompt(context)};
    } catch (error) {
        console.error('Error building second-opinion prompt:', error);
        return {success: false, message: 'Could not build the prompt'};
    }
};

// Path 2 (return leg): save what Claude answered on claude.ai. Scoped to the
// pasting user, link-stripped, and rendered as markdown without raw HTML.
export const saveManualSecondOpinion = async (opinionMd: string): Promise<OrderResult> => {
    try {
        const userId = await getCurrentUserId();
        if (!userId) return {success: false, message: 'Not authenticated'};

        const text = (opinionMd || '').trim();
        if (text.length < MIN_PASTED_CHARS) return {success: false, message: 'That looks too short to be an opinion'};
        if (text.length > SECOND_OPINION_MAX_CHARS * 2) return {success: false, message: 'That is far longer than an opinion — paste just Claude’s answer'};

        await saveSecondOpinion({userId, opinionMd: text, modelUsed: MANUAL_MODEL_LABEL, source: 'manual'});
        revalidatePath('/brain');
        return {success: true, message: 'Saved — it now shows on your Brain page'};
    } catch (error) {
        console.error('Error saving pasted second opinion:', error);
        return {success: false, message: 'Could not save the opinion'};
    }
};
