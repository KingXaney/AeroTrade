import { Inngest, type GetStepTools } from "inngest";
import { geminiApiKey } from "@/lib/ai/models";

// The Gemini key is the plan's (AI_PLAN: the free project's key or a billed one, lib/ai/models).
export const inngest = new Inngest({
    id: 'aerotrade',
    ai: { gemini: { apiKey: geminiApiKey() } },
})

// The `step` every job function is handed, for the feature modules that drive steps themselves
// (lib/navigator/run.ts).
export type JobStep = GetStepTools<typeof inngest>;
