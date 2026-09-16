// Which model runs which scheduled job. Model strings used to be scattered — three
// sites shared a constant and three more hard-coded their own literal — so switching
// provider meant hunting them down. This is the single table.
//
// Import-free on purpose: resolution is pure and unit-tested, and the "default costs
// nothing" contract is an assertion in that suite rather than a comment here.

export type AiTask = 'extraction' | 'digest' | 'rationale' | 'welcome' | 'topicBrief';
export type AiTier = 'free' | 'basic' | 'pro';
export type AiProvider = 'gemini' | 'anthropic';

export type ModelSpec = {
    provider: AiProvider;
    model: string;
    // Required by the Anthropic adapter; ignored by Gemini.
    maxTokens: number;
    // Anthropic 5-series only. A spec must never be a bare model string: Opus and
    // Sonnet 5 run adaptive thinking when it is not configured, thinking bills as
    // output, and it shares this ceiling with the payload — an untuned entry is both
    // a surprise bill and a truncation risk.
    effort?: 'low' | 'medium' | 'high';
    // Gemini's responseMimeType. The Anthropic adapter has no equivalent, so on that
    // provider the prompt's "return only JSON" instruction is what enforces shape.
    jsonMode?: boolean;
};

export const GEMINI_FLASH_LITE = 'gemini-2.5-flash-lite';

const FREE: Record<AiTask, ModelSpec> = {
    extraction: {provider: 'gemini', model: GEMINI_FLASH_LITE, maxTokens: 8192, jsonMode: true},
    digest: {provider: 'gemini', model: GEMINI_FLASH_LITE, maxTokens: 8192},
    rationale: {provider: 'gemini', model: GEMINI_FLASH_LITE, maxTokens: 2048},
    welcome: {provider: 'gemini', model: GEMINI_FLASH_LITE, maxTokens: 1024},
    topicBrief: {provider: 'gemini', model: GEMINI_FLASH_LITE, maxTokens: 1024, jsonMode: true},
};

// Haiku has no adaptive thinking and rejects `effort`, so this tier needs no spend
// controls and its cost is entirely predictable.
const BASIC: Record<AiTask, ModelSpec> = {
    extraction: {provider: 'anthropic', model: 'claude-haiku-4-5', maxTokens: 8192, jsonMode: true},
    digest: {provider: 'anthropic', model: 'claude-haiku-4-5', maxTokens: 8192},
    rationale: {provider: 'anthropic', model: 'claude-haiku-4-5', maxTokens: 2048},
    welcome: {provider: 'anthropic', model: 'claude-haiku-4-5', maxTokens: 1024},
    topicBrief: {provider: 'anthropic', model: 'claude-haiku-4-5', maxTokens: 1024, jsonMode: true},
};

// Only the two tasks where model quality reaches a decision or a human get upgraded.
// Rationale only restates deterministic reasons and welcome writes 40 words, so a
// frontier model would add cost and nothing else.
const PRO: Record<AiTask, ModelSpec> = {
    // Thinking stays ON at low effort deliberately: disabling it on Opus 5 can leak
    // <thinking> into the visible answer, which here means JSON.parse throws and a
    // whole 20-article batch is dropped.
    extraction: {provider: 'anthropic', model: 'claude-opus-5', maxTokens: 12288, effort: 'low', jsonMode: true},
    digest: {provider: 'anthropic', model: 'claude-sonnet-5', maxTokens: 8192, effort: 'medium'},
    rationale: {provider: 'anthropic', model: 'claude-haiku-4-5', maxTokens: 2048},
    welcome: {provider: 'anthropic', model: 'claude-haiku-4-5', maxTokens: 1024},
    // A topic brief never reaches a trading decision; the cheap model is the right one.
    topicBrief: {provider: 'anthropic', model: 'claude-haiku-4-5', maxTokens: 1024, jsonMode: true},
};

export const MODEL_MATRIX: Record<AiTier, Record<AiTask, ModelSpec>> = {free: FREE, basic: BASIC, pro: PRO};

export const AI_TIERS: AiTier[] = ['free', 'basic', 'pro'];
export const AI_TASKS: AiTask[] = ['extraction', 'digest', 'rationale', 'welcome', 'topicBrief'];

const isTier = (value: string): value is AiTier => (AI_TIERS as string[]).includes(value);

export type TierResolution = {tier: AiTier; warning?: string};

// Named `free`, never `subscription`: a server-side job cannot use a Claude
// subscription, and labelling a deployment variable that way invites exactly the
// mistake .env.example warns about.
export const resolveTier = (env: NodeJS.ProcessEnv = process.env): TierResolution => {
    const raw = (env.AI_TIER || '').trim();
    if (!raw) return {tier: 'free'};
    if (!isTier(raw)) {
        return {tier: 'free', warning: `AI_TIER="${raw}" is not free|basic|pro — using free (Gemini).`};
    }
    if (raw !== 'free' && !env.ANTHROPIC_API_KEY) {
        // Fail to the free tier rather than to an outage: a missing key must never
        // stop the daily brain update.
        return {tier: 'free', warning: `AI_TIER="${raw}" needs ANTHROPIC_API_KEY — using free (Gemini).`};
    }
    return {tier: raw};
};

export type ResolvedModel = ModelSpec & {task: AiTask; tier: AiTier; warning?: string};

export const resolveModel = (task: AiTask, env: NodeJS.ProcessEnv = process.env): ResolvedModel => {
    const {tier, warning} = resolveTier(env);
    return {...MODEL_MATRIX[tier][task], task, tier, ...(warning ? {warning} : {})};
};

export const isProviderConfigured = (provider: AiProvider, env: NodeJS.ProcessEnv = process.env): boolean =>
    provider === 'anthropic' ? Boolean(env.ANTHROPIC_API_KEY) : Boolean(env.GEMINI_API_KEY);
