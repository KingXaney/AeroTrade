import {describe, expect, it} from 'vitest';
import {STRATEGIES, strategyBySlug} from '@/lib/strategies/catalog';
import {findParam, readParam} from '@/lib/strategies/params';
import {readParam as readParamFromRules} from '@/lib/strategies/rules/shared';
import type {StrategyDefinition} from '@/lib/strategies/types';

const rsi2 = strategyBySlug('rsi2-mean-reversion') as StrategyDefinition;

describe('readParam', () => {
    it('reads a numeric catalog parameter', () => {
        expect(readParam(rsi2, 'entryRsi')).toBe(10);
        expect(readParam(rsi2, 'trendSma')).toBe(200);
    });

    it('treats a missing parameter as a catalog bug', () => {
        expect(() => readParam(rsi2, 'noSuchParam')).toThrow(/missing numeric param "noSuchParam"/);
    });

    it('is the one the rules layer re-exports', () => {
        expect(readParamFromRules).toBe(readParam);
    });

    it('covers every parameter the catalog declares', () => {
        for (const def of STRATEGIES) {
            for (const key of Object.keys(def.params)) {
                expect(Number.isFinite(readParam(def, key)), `${def.id}.${key}`).toBe(true);
            }
        }
    });
});

describe('findParam', () => {
    it('returns null instead of throwing, for callers that must never throw', () => {
        expect(findParam(rsi2, 'exitSma')).toBe(5);
        expect(findParam(rsi2, 'noSuchParam')).toBeNull();
        expect(findParam({...rsi2, params: {...rsi2.params, exitSma: 'five'}}, 'exitSma')).toBeNull();
    });
});
