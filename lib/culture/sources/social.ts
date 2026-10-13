// The social-trends slot. TikTok, Instagram and Snapchat publish no trend API a product may
// use (TikTok's research API is academic-only; Instagram's hashtag endpoint needs a business
// account and app review; Snapchat Trends is a website), so this is a registry a paid provider
// can be added to under lib/culture/sources/social/<provider>.ts — one file and one line here.
// CULTURE_SOCIAL_ADAPTER names the provider; unset, the daily job has no social source and says so.

import type {AttentionRow, CultureBrand, CultureItemInput} from "@/lib/culture/types";

export type SocialAdapter = {
    id: string;
    fetchDaily(input: {day: string; catalog: readonly CultureBrand[]}): Promise<{items: CultureItemInput[]; rows: AttentionRow[]}>;
};

type SocialEnv = Readonly<Record<string, string | undefined>>;

// Empty in v1. A provider's factory reads its own key from the env and returns null without it.
const REGISTRY: Record<string, (env: SocialEnv) => SocialAdapter | null> = {};

export const socialAdapterIds = (): string[] => Object.keys(REGISTRY);

export const resolveSocialAdapter = (env: SocialEnv = process.env): SocialAdapter | null => {
    const name = (env.CULTURE_SOCIAL_ADAPTER ?? '').trim();
    if (!name) return null;
    const factory = REGISTRY[name];
    if (!factory) {
        console.warn(`CULTURE_SOCIAL_ADAPTER="${name}" names no registered social adapter — no social source this run`);
        return null;
    }
    return factory(env);
};
