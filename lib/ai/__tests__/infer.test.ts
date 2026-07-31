// The two providers disagree on both halves of a call. These cover the shapes that
// used to be hand-written at five separate sites.

import {describe, expect, it} from "vitest";

import {
    buildAnthropicBody,
    buildGeminiBody,
    normalizeAnthropicResponse,
    normalizeGeminiResponse,
} from "@/lib/ai/infer";
import {MODEL_MATRIX} from "@/lib/ai/models";

const GEMINI_SPEC = MODEL_MATRIX.free.digest;
const GEMINI_JSON_SPEC = MODEL_MATRIX.free.extraction;
const OPUS_SPEC = MODEL_MATRIX.pro.extraction;
const HAIKU_SPEC = MODEL_MATRIX.basic.rationale;

describe("buildGeminiBody", () => {
    it("puts the prompt in a single user turn", () => {
        expect(buildGeminiBody(GEMINI_SPEC, "hello")).toEqual({
            contents: [{role: "user", parts: [{text: "hello"}]}],
        });
    });

    it("prepends the system text, since Gemini takes none at this layer", () => {
        const body = buildGeminiBody(GEMINI_SPEC, "question", "you are a tagger");
        expect(body.contents[0].parts[0].text).toBe("you are a tagger\n\n---\n\nquestion");
    });

    it("asks for JSON only when the spec does", () => {
        expect(buildGeminiBody(GEMINI_JSON_SPEC, "x")).toHaveProperty(
            "generationConfig.responseMimeType",
            "application/json",
        );
        expect(buildGeminiBody(GEMINI_SPEC, "x")).not.toHaveProperty("generationConfig");
    });
});

describe("buildAnthropicBody", () => {
    it("uses a top-level system field, never a system message", () => {
        const body = buildAnthropicBody(HAIKU_SPEC, "question", "you are a narrator");
        expect(body.system).toBe("you are a narrator");
        expect(body.messages).toEqual([{role: "user", content: "question"}]);
        expect(body.messages.some((m) => m.role !== "user")).toBe(false);
    });

    it("passes effort only when the spec carries one", () => {
        expect(buildAnthropicBody(OPUS_SPEC, "x")).toHaveProperty("output_config.effort", "low");
        expect(buildAnthropicBody(HAIKU_SPEC, "x")).not.toHaveProperty("output_config");
    });

    // Claude 5 models reject these with a 400 even though the adapter still types them.
    it("never sends sampling parameters", () => {
        const body = buildAnthropicBody(OPUS_SPEC, "x", "sys") as Record<string, unknown>;
        expect(body.temperature).toBeUndefined();
        expect(body.top_p).toBeUndefined();
        expect(body.top_k).toBeUndefined();
    });

    // max_tokens belongs in defaultParameters — the adapter assigns defaults over the
    // body, so a body value would be silently dropped.
    it("keeps max_tokens out of the body", () => {
        expect(buildAnthropicBody(OPUS_SPEC, "x") as Record<string, unknown>).not.toHaveProperty("max_tokens");
    });
});

describe("normalizeGeminiResponse", () => {
    it("reads the first text part", () => {
        expect(normalizeGeminiResponse({candidates: [{content: {parts: [{text: "answer"}]}}]}).text).toBe("answer");
    });

    // Carried through so a SAFETY or MAX_TOKENS stop shows up in the logs on the
    // default tier, not only when Claude refuses.
    it("carries the finish reason through", () => {
        expect(normalizeGeminiResponse({candidates: [{content: {parts: [{text: "a"}]}, finishReason: "SAFETY"}]}).stopReason)
            .toBe("SAFETY");
    });

    it("returns empty for every missing shape rather than throwing", () => {
        expect(normalizeGeminiResponse({}).text).toBe("");
        expect(normalizeGeminiResponse({candidates: []}).text).toBe("");
        expect(normalizeGeminiResponse({candidates: [{content: {parts: []}}]}).text).toBe("");
        expect(normalizeGeminiResponse({candidates: [{content: {parts: [{inlineData: {}}]}}]}).text).toBe("");
        expect(normalizeGeminiResponse(undefined).text).toBe("");
    });
});

describe("normalizeAnthropicResponse", () => {
    it("reads a single text block", () => {
        expect(normalizeAnthropicResponse({content: [{type: "text", text: "answer"}], stop_reason: "end_turn"}))
            .toEqual({text: "answer", stopReason: "end_turn"});
    });

    it("joins multiple text blocks", () => {
        expect(normalizeAnthropicResponse({content: [
            {type: "text", text: "one"},
            {type: "text", text: "two"},
        ]}).text).toBe("one\ntwo");
    });

    // With thinking on, a thinking block can arrive first even though the adapter's
    // union denies it — taking content[0] would return reasoning as the answer.
    it("ignores a leading thinking block", () => {
        expect(normalizeAnthropicResponse({content: [
            {type: "thinking", text: "let me consider"},
            {type: "text", text: "the answer"},
        ]}).text).toBe("the answer");
    });

    it("surfaces a refusal as an empty answer with its stop reason", () => {
        expect(normalizeAnthropicResponse({content: [], stop_reason: "refusal"}))
            .toEqual({text: "", stopReason: "refusal"});
    });

    it("returns empty for every missing shape rather than throwing", () => {
        expect(normalizeAnthropicResponse({})).toEqual({text: "", stopReason: null});
        expect(normalizeAnthropicResponse(undefined)).toEqual({text: "", stopReason: null});
        expect(normalizeAnthropicResponse({content: [{type: "tool_use"}]}).text).toBe("");
    });
});
