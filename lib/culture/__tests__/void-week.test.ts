// A picker's week that bought nothing because no owner could be bought — missing data, not a
// judgement — is no week used: the next weekly run (Tuesday's retry) decides it again. Only a
// decision that stored its eligibility, found none eligible, and executed nothing is void.

import {describe, expect, it} from 'vitest';
import {isVoidWeek} from '@/lib/culture/decisions';

const eligibility = (eligible: number) => ({total: 130, eligible, noAttention: 130 - eligible, fewBars: 0, unquoted: 0});
const item = (executed: boolean) => ({executed});

describe('isVoidWeek', () => {
    it('is a decision with no owner eligible that executed nothing', () => {
        expect(isVoidWeek({eligibility: eligibility(0), items: []})).toBe(true);
        expect(isVoidWeek({eligibility: eligibility(0), items: [item(false)]})).toBe(true);
    });

    it('is never a week in which something filled, or an owner could be bought, or one decided before eligibility was stored', () => {
        expect(isVoidWeek({eligibility: eligibility(0), items: [item(true)]})).toBe(false);
        expect(isVoidWeek({eligibility: eligibility(3), items: []})).toBe(false);
        expect(isVoidWeek({eligibility: null, items: []})).toBe(false);
        expect(isVoidWeek({items: []})).toBe(false);
        expect(isVoidWeek(null)).toBe(false);
    });
});
