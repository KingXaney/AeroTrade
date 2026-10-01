// One starting-balance rule and one refusal: creating an account, resetting one and
// re-enrolling the AI Navigator all reject a bad balance with the same sentence, built from
// the range the dialogs print.

import {readFileSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {STARTING_BALANCE_ERROR, STARTING_BALANCE_RANGE, resolveStartingBalance} from '@/lib/trading/starting-balance';

describe('the starting balance', () => {
    it('states the range in its one refusal', () => {
        expect(STARTING_BALANCE_RANGE).toBe('$1,000 and $10,000,000');
        expect(STARTING_BALANCE_ERROR).toBe('Starting balance must be between $1,000 and $10,000,000');
    });

    it('accepts whole dollars in range and refuses the rest', () => {
        expect(resolveStartingBalance(undefined)).toBe(100_000);
        expect(resolveStartingBalance(2_500.75)).toBe(2_500);
        expect(resolveStartingBalance(999)).toBeNull();
        expect(resolveStartingBalance(Number.NaN)).toBeNull();
    });

    // The actions cannot be imported here (invariant 1), so their source is read as text.
    it.each(['lib/actions/accounts.actions.ts', 'lib/actions/navigator.actions.ts'])('%s refuses with the shared sentence only', (file) => {
        const source = readFileSync(path.resolve(__dirname, '../../..', file), 'utf8');
        expect(source).not.toMatch(/Invalid starting balance/);
        expect(source).not.toMatch(/must be between \$\{/);
        expect(source).toMatch(/STARTING_BALANCE_ERROR/);
    });
});
