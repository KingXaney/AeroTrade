import {convertToModelMessages, streamText, stepCountIs, type UIMessage} from "ai";
import {createGoogleGenerativeAI} from "@ai-sdk/google";
import {ADVISOR_SYSTEM_PROMPT} from "@/lib/ai/system-prompt";
import {buildTools} from "@/lib/ai/tools";
import {getCurrentUserId} from "@/lib/actions/watchlist.actions";

// The Google provider defaults to GOOGLE_GENERATIVE_AI_API_KEY; this project keeps the same key
// under GEMINI_API_KEY (shared with the inngest news pipeline), so we wire it explicitly.
const google = createGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY,
});

export const runtime = 'nodejs'; // mongoose + better-auth need Node, not edge
export const maxDuration = 30;

export async function POST(req: Request) {
    const userId = await getCurrentUserId();
    if (!userId) {
        return new Response('Unauthorized', {status: 401});
    }

    const {messages}: {messages: UIMessage[]} = await req.json();

    const result = streamText({
        model: google('gemini-2.5-flash'),
        system: ADVISOR_SYSTEM_PROMPT,
        messages: await convertToModelMessages(messages),
        tools: buildTools(userId),
        stopWhen: stepCountIs(5), // allow tool → model → tool chains, capped
    });

    return result.toUIMessageStreamResponse();
}
