// One place that knows how each provider wants a request and returns an answer.
// Five call sites used to hand-write both halves, which is why swapping provider
// meant touching all of them.

import type {GetStepTools, Inngest} from "inngest";

import {resolveModel, type AiProvider, type AiTask, type ModelSpec} from "@/lib/ai/models";

export type InferResult = {
    // '' rather than a throw when nothing usable came back: every call site already
    // has a correct fallback, and throwing here would change Inngest retry semantics
    // for the whole enclosing run.
    text: string;
    // Widened to string: Claude's 'refusal' is newer than the adapter's union.
    stopReason: string | null;
    provider: AiProvider;
    model: string;
};

type GeminiPart = {text?: string};
type GeminiResponse = {candidates?: Array<{content?: {parts?: GeminiPart[]}; finishReason?: string}>};
type AnthropicBlock = {type?: string; text?: string};
type AnthropicResponse = {content?: AnthropicBlock[]; stop_reason?: string | null};

export const buildGeminiBody = (spec: ModelSpec, prompt: string, system?: string) => ({
    // Gemini takes no top-level system field here, so it leads the single user turn —
    // the same convention buildStandaloneSecondOpinionPrompt already uses for the CLI.
    contents: [{role: 'user' as const, parts: [{text: system ? `${system}\n\n---\n\n${prompt}` : prompt}]}],
    ...(spec.jsonMode ? {generationConfig: {responseMimeType: 'application/json'}} : {}),
});

export const buildAnthropicBody = (spec: ModelSpec, prompt: string, system?: string) => ({
    messages: [{role: 'user' as const, content: prompt}],
    ...(system ? {system} : {}),
    // Never a role:'system' message, and never temperature/top_p/top_k — the adapter
    // still types those but Claude 5 models reject them with a 400.
    //
    // output_config is NOT in @inngest/ai 0.1.7's Input type (it predates the field),
    // but the adapter only supplies url/headers/auth and posts the body verbatim, so
    // it reaches the API. It rides along here because excess properties are allowed on
    // a returned object; re-check this on any @inngest/ai upgrade.
    ...(spec.effort ? {output_config: {effort: spec.effort}} : {}),
});

export const normalizeGeminiResponse = (response: unknown): {text: string; stopReason: string | null} => {
    const candidate = (response as GeminiResponse)?.candidates?.[0];
    const part = candidate?.content?.parts?.[0];
    return {
        text: part && typeof part.text === 'string' ? part.text : '',
        // Carried through so a SAFETY or MAX_TOKENS stop is visible in the logs on the
        // default tier too, not only when Claude refuses.
        stopReason: candidate?.finishReason ?? null,
    };
};

export const normalizeAnthropicResponse = (response: unknown): {text: string; stopReason: string | null} => {
    const message = response as AnthropicResponse;
    // Filter on type, never take content[0]: with thinking on, a thinking block can
    // precede the text even though the adapter's union does not admit one.
    const text = (message?.content ?? [])
        .filter((block) => block?.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text as string)
        .join('\n')
        .trim();
    return {text, stopReason: message?.stop_reason ?? null};
};

// Inngest's own step type: step.ai.infer is generic over its adapter and correlates
// model with body, which a hand-rolled structural type cannot express.
type InferStep = Pick<GetStepTools<Inngest.Any>, 'ai'>;

export const inferText = async (
    step: InferStep,
    {task, stepId, prompt, system}: {task: AiTask; stepId: string; prompt: string; system?: string},
): Promise<InferResult> => {
    const spec = resolveModel(task);
    if (spec.warning) console.warn(`AI tier: ${spec.warning}`);

    if (spec.provider === 'anthropic') {
        const response = await step.ai.infer(stepId, {
            // max_tokens goes in defaultParameters, not the body: the Anthropic adapter
            // assigns defaults OVER the body (Gemini's does the reverse), so a body
            // value would be silently clobbered.
            model: step.ai.models.anthropic({model: spec.model, defaultParameters: {max_tokens: spec.maxTokens}}),
            body: buildAnthropicBody(spec, prompt, system),
        });
        const {text, stopReason} = normalizeAnthropicResponse(response);
        return {text, stopReason, provider: spec.provider, model: spec.model};
    }

    const response = await step.ai.infer(stepId, {
        model: step.ai.models.gemini({model: spec.model}),
        body: buildGeminiBody(spec, prompt, system),
    });
    const {text, stopReason} = normalizeGeminiResponse(response);
    return {text, stopReason, provider: spec.provider, model: spec.model};
};
