// The welcome email's send (NOT a 'use server' module): the sign-up-email job
// (lib/jobs/functions/email.ts) has the model write a two-sentence intro from the user's own
// sign-up answers (lib/email/prompts.ts), then sends it through here.

import {sendWelcomeEmail} from "@/lib/email/send";
import {sanitizeWelcomeIntroHtml} from "@/lib/news/sanitize";

const FALLBACK_INTRO = 'Thanks for joining AeroTrade. You now have the tools to track markets and make smarter moves.';

export const sendWelcome = async ({email, name}: {email: string; name: string}, rawIntro: string): Promise<void> => {
    // The model wrote this from the user's own signup answers and it lands in
    // the template unescaped — sanitize before it becomes email.
    const introText = sanitizeWelcomeIntroHtml(rawIntro || '')
        || sanitizeWelcomeIntroHtml(FALLBACK_INTRO);

    return await sendWelcomeEmail({email, name, intro: introText});
};
