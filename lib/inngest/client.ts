import { Inngest} from "inngest";

export const inngest = new Inngest({
    id: 'AlgoTest',
    ai: { gemini: { apiKey: process.env.GEMINI_API_KEY}}
})