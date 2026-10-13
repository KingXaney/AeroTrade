import {describe, expect, it} from 'vitest';
import {isLabOwner, labEnabled, labOwnerEmails, LAB_OWNER_ENV} from '@/lib/lab/owner';

describe('the lab owner gate', () => {
    it('reads a comma-separated list, trimmed and lower-cased, and nothing when unset', () => {
        expect(labOwnerEmails({[LAB_OWNER_ENV]: ' Owner@Example.com , second@example.com,,'})).toEqual(['owner@example.com', 'second@example.com']);
        expect(labOwnerEmails({})).toEqual([]);
        expect(labOwnerEmails({[LAB_OWNER_ENV]: ''})).toEqual([]);
    });

    it('admits a listed email whatever its case, and nobody when the variable is unset', () => {
        const env = {[LAB_OWNER_ENV]: 'owner@example.com'};
        expect(isLabOwner('OWNER@example.com', env)).toBe(true);
        expect(isLabOwner(' owner@example.com ', env)).toBe(true);
        expect(isLabOwner('other@example.com', env)).toBe(false);
        expect(isLabOwner(null, env)).toBe(false);
        expect(isLabOwner(undefined, env)).toBe(false);
        expect(isLabOwner('', env)).toBe(false);
        expect(isLabOwner('owner@example.com', {})).toBe(false);
        expect(labEnabled(env)).toBe(true);
        expect(labEnabled({})).toBe(false);
    });
});
