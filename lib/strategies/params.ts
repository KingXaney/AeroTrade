// Rule parameters live in the catalog so the explainer's table and the code cannot drift
// apart. This is the one reader of `def.params`: the rules read through `readParam`
// (re-exported from rules/shared.ts), and the reason decoder in lib/learn reads through
// `findParam`, which never throws, so a client tree can import it without the rules layer.

import type {StrategyDefinition} from '@/lib/strategies/types';

export const findParam = (def: StrategyDefinition, key: string): number | null => {
    const value = Number(def.params[key]);
    return Number.isFinite(value) ? value : null;
};

// A missing one is a catalog bug, not a runtime condition.
export const readParam = (def: StrategyDefinition, key: string): number => {
    const value = findParam(def, key);
    if (value === null) throw new Error(`strategy ${def.id}: missing numeric param "${key}"`);
    return value;
};
