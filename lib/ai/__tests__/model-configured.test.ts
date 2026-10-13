import {describe, expect, it} from 'vitest';
import {modelConfigured} from '@/lib/ai/models';

const env = (vars: Record<string, string>): NodeJS.ProcessEnv => vars as unknown as NodeJS.ProcessEnv;

describe('modelConfigured', () => {
    it('is true with a Gemini key, or a paid tier with its Anthropic key, and false otherwise', () => {
        expect(modelConfigured(env({GEMINI_API_KEY: 'g'}))).toBe(true);
        expect(modelConfigured(env({AI_TIER: 'basic', ANTHROPIC_API_KEY: 'a'}))).toBe(true);
        expect(modelConfigured(env({AI_TIER: 'basic'}))).toBe(false);
        expect(modelConfigured(env({GEMINI_API_KEY: '  '}))).toBe(false);
        expect(modelConfigured(env({}))).toBe(false);
        // The paid plan's key counts, and a paid plan without it falls back to the free key.
        expect(modelConfigured(env({AI_PLAN: 'paid', GEMINI_API_KEY_PAID: 'p'}))).toBe(true);
        expect(modelConfigured(env({AI_PLAN: 'paid', GEMINI_API_KEY: 'g'}))).toBe(true);
        expect(modelConfigured(env({AI_PLAN: 'paid'}))).toBe(false);
    });
});
