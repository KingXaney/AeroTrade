// Claude second-opinion plumbing (NOT a 'use server' module). The deterministic
// navigator still makes every trade — Claude only critiques what the brain and
// allocator already decided. A stronger narrator, never a second trader.

import SecondOpinion from "@/database/models/second-opinion.model";
import {connectToDatabase} from "@/database/mongoose";

export const SECOND_OPINION_MODEL = 'claude-opus-5';
// On Claude Opus 5 thinking is on by default and shares this cap with the
// visible text — leave headroom so the answer never truncates mid-thought.
export const SECOND_OPINION_MAX_TOKENS = 16000;
// Paid API behind a button: refuse regeneration while a fresh opinion exists.
export const SECOND_OPINION_MIN_INTERVAL_MS = 15 * 60 * 1000;
export const SECOND_OPINION_MAX_CHARS = 8000;
export const SECOND_OPINION_HEADLINE_COUNT = 15;

export const isSecondOpinionConfigured = (): boolean => Boolean(process.env.ANTHROPIC_API_KEY);

export type SecondOpinionView = {
    opinionMd: string;
    model: string;
    generatedAt: number; // epoch ms
};

export const getLatestSecondOpinion = async (): Promise<SecondOpinionView | null> => {
    await connectToDatabase();
    const doc = await SecondOpinion.findOne({scope: 'global'})
        .lean<{opinionMd: string; modelUsed: string; generatedAt: Date}>();
    if (!doc) return null;
    return {
        opinionMd: doc.opinionMd,
        model: doc.modelUsed,
        generatedAt: new Date(doc.generatedAt).getTime(),
    };
};

// A markdown link could smuggle a phishing URL sourced from scraped headlines
// into the rendered opinion — keep the text, drop the target. Bare URLs go too.
export const stripMarkdownLinks = (md: string): string =>
    md.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/https?:\/\/\S+/g, '');
