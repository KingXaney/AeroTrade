import { Inngest, type GetStepTools } from "inngest";

export const inngest = new Inngest({
    id: 'aerotrade',
    ai: { gemini: { apiKey: process.env.GEMINI_API_KEY}}
})

// The `step` every job function is handed, for the feature modules that drive steps themselves
// (lib/navigator/run.ts).
export type JobStep = GetStepTools<typeof inngest>;
