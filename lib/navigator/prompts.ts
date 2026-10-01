// The Navigator's one LLM call: a weekly note that paraphrases the deterministic reasons behind
// its decisions — it never picks positions or sizes.

import {injectJson} from "@/lib/ai/prompt-utils";
import type {SuggestionItem} from '@/lib/navigator/types';

// Shared by the weekly run and the enrollment bootstrap, which must narrate
// identically. Goes through injectJson for the same reason the extraction prompt
// does: a reason string is built from scraped text, and "$&" in a replacement
// string would rewrite the prompt around itself.
export const buildRationalePrompt = (items: SuggestionItem[], narratives: unknown): string => {
    const summarized = items.map((item) => ({
        action: item.action,
        symbol: item.symbol,
        targetWeightPct: Math.round(item.targetWeight * 100),
        reasons: item.reasons,
    }));
    return injectJson(injectJson(RATIONALE_PROMPT, '{{items}}', summarized), '{{narratives}}', narratives);
};

export const RATIONALE_PROMPT = `You are the narrator for an automated PAPER-TRADING experiment (no real money). Write a weekly update in ~120 words of plain markdown (no headings, no code fences).

This week's decisions (deterministic scoring output — your ONLY source of facts):
{{items}}

Top active market narratives from the news brain:
{{narratives}}

Rules:
- ONLY restate the provided reasons and narratives. Never invent tickers, numbers, predictions, or facts not present above.
- Explain the week's moves (or why the portfolio is holding still) in plain English, referencing the thesis names.
- End with exactly this sentence: "This is an automated paper-trading experiment, not financial advice."`;
