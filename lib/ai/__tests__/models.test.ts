// Tier resolution is where the money is decided, so the cost contracts live here as
// assertions rather than as comments in the config.

import {describe, expect, it} from "vitest";

import {
    AI_TIERS,
    GEMINI_FLASH_LITE,
    MODEL_MATRIX,
    resolveModel,
    resolveTier,
    type AiTask,
    type AiTier,
} from "@/lib/ai/models";

const env = (overrides: Record<string, string> = {}) => overrides as NodeJS.ProcessEnv;
const WITH_KEY = {ANTHROPIC_API_KEY: "sk-test"};
// Every task the matrix prices (the AiTask union, read from the matrix itself).
const AI_TASKS = Object.keys(MODEL_MATRIX.free) as AiTask[];

describe("the matrix", () => {
    it("covers every task in every tier", () => {
        for (const tier of AI_TIERS) {
            for (const task of AI_TASKS) {
                expect(MODEL_MATRIX[tier][task], `${tier}/${task}`).toBeDefined();
            }
        }
    });

    it("gives every entry a non-zero output ceiling", () => {
        for (const tier of AI_TIERS) {
            for (const task of AI_TASKS) {
                expect(MODEL_MATRIX[tier][task].maxTokens, `${tier}/${task}`).toBeGreaterThan(0);
            }
        }
    });

    // The "default costs nothing" contract. If this ever fails, an unset AI_TIER has
    // started billing an API.
    it("never routes the free tier to a paid provider", () => {
        for (const task of AI_TASKS) {
            expect(MODEL_MATRIX.free[task].provider, task).toBe("gemini");
            expect(MODEL_MATRIX.free[task].model, task).toBe(GEMINI_FLASH_LITE);
        }
    });

    // Opus and Sonnet run adaptive thinking when it isn't configured, and thinking
    // bills as output under the same ceiling as the payload. An entry without a spend
    // control is both a surprise bill and a truncation risk.
    it("gives every thinking-capable model an explicit effort", () => {
        for (const tier of AI_TIERS) {
            for (const task of AI_TASKS) {
                const spec = MODEL_MATRIX[tier][task];
                if (/^claude-(opus|sonnet)/.test(spec.model)) {
                    expect(spec.effort, `${tier}/${task} needs an effort`).toBeDefined();
                }
            }
        }
    });

    it("keeps JSON mode on extraction in every tier", () => {
        for (const tier of AI_TIERS) {
            expect(MODEL_MATRIX[tier].extraction.jsonMode, tier).toBe(true);
        }
    });

    // The brief parser expects a JSON object; prose would fall back to a raw-text brief.
    it("keeps JSON mode on topic briefs in every tier", () => {
        for (const tier of AI_TIERS) {
            expect(MODEL_MATRIX[tier].topicBrief.jsonMode, tier).toBe(true);
        }
    });

    // The briefing parser reads citations out of a JSON object; prose has none, so it would
    // drop the whole briefing.
    it("keeps JSON mode on the market briefing in every tier", () => {
        for (const tier of AI_TIERS) {
            expect(MODEL_MATRIX[tier].marketBriefing.jsonMode, tier).toBe(true);
        }
    });
});

describe("resolveTier", () => {
    it("defaults to free when AI_TIER is unset or blank", () => {
        expect(resolveTier(env())).toEqual({tier: "free"});
        expect(resolveTier(env({AI_TIER: "   "}))).toEqual({tier: "free"});
    });

    it("honours a valid tier when the key is present", () => {
        for (const tier of ["basic", "pro"] as AiTier[]) {
            expect(resolveTier(env({AI_TIER: tier, ...WITH_KEY}))).toEqual({tier});
        }
    });

    it("falls back to free and explains itself on an unknown tier", () => {
        const resolved = resolveTier(env({AI_TIER: "premium", ...WITH_KEY}));
        expect(resolved.tier).toBe("free");
        expect(resolved.warning).toContain("premium");
    });

    // A missing key must degrade, never fail: the daily brain update has to run.
    it("falls back to free when a paid tier has no API key", () => {
        const resolved = resolveTier(env({AI_TIER: "pro"}));
        expect(resolved.tier).toBe("free");
        expect(resolved.warning).toContain("ANTHROPIC_API_KEY");
    });

    it("does not require a key for the free tier", () => {
        expect(resolveTier(env({AI_TIER: "free"}))).toEqual({tier: "free"});
    });
});

describe("resolveModel", () => {
    it("returns today's Gemini model for every task when unconfigured", () => {
        for (const task of AI_TASKS) {
            const spec = resolveModel(task, env());
            expect(spec.provider).toBe("gemini");
            expect(spec.model).toBe(GEMINI_FLASH_LITE);
            expect(spec.tier).toBe("free");
        }
    });

    it("routes to Claude once a tier and key are set", () => {
        expect(resolveModel("extraction", env({AI_TIER: "pro", ...WITH_KEY}))).toMatchObject({
            provider: "anthropic",
            model: "claude-opus-5",
            effort: "low",
        });
        expect(resolveModel("rationale", env({AI_TIER: "pro", ...WITH_KEY})).model).toBe("claude-haiku-4-5");
    });

    it("carries the downgrade warning through to the caller", () => {
        expect(resolveModel("digest", env({AI_TIER: "basic"})).warning).toBeDefined();
    });
});
