import {describe, expect, it} from "vitest";
import {chunk, stepId} from "@/lib/jobs/steps";
import {STRATEGIES} from "@/lib/strategies/catalog";

describe("chunk", () => {
    it("splits into bounded chunks and never drops an item", () => {
        const symbols = Array.from({length: 59}, (_, i) => `S${i}`);
        const chunks = chunk(symbols, 12);
        expect(chunks.map((c) => c.length)).toEqual([12, 12, 12, 12, 11]);
        expect(chunks.flat()).toEqual(symbols);
        expect(chunk([], 12)).toEqual([]);
        expect(chunk(['A'], 0)).toEqual([['A']]);
    });
});

describe("stepId", () => {
    it("sanitises the sentinel and is a no-op on every catalog id", () => {
        expect(stepId('system:strategies')).toBe('system_strategies');
        for (const def of STRATEGIES) expect(stepId(def.id)).toBe(def.id);
    });

    it("maps every character outside [a-zA-Z0-9_-] to '_' and is idempotent", () => {
        expect(stepId('execute-order-u:1-buy-BRK.B')).toBe('execute-order-u_1-buy-BRK_B');
        expect(stepId('a+b@c.com')).toBe('a_b_c_com');
        expect(stepId(stepId('x y.z'))).toBe(stepId('x y.z'));
    });
});
