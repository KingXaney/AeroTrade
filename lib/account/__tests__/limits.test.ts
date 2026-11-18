// The account actions' counters and the deletion's typed confirmation.

import {describe, expect, it} from 'vitest';
import {ACCOUNT_DELETE_LIMIT, PASSWORD_CHANGE_LIMIT, accountDeleteKey, confirmsDeletion, passwordChangeKey} from '@/lib/account/limits';

describe('account limits', () => {
    it('counts each action per account, under its own key', () => {
        expect(passwordChangeKey('u1')).toBe('account:password:u1');
        expect(accountDeleteKey('u1')).toBe('account:delete:u1');
        expect(passwordChangeKey('u1')).not.toBe(accountDeleteKey('u1'));
    });

    it('allows a handful of attempts, not a guessing run', () => {
        expect(PASSWORD_CHANGE_LIMIT).toBeLessThanOrEqual(10);
        expect(ACCOUNT_DELETE_LIMIT).toBeLessThanOrEqual(10);
    });
});

describe('confirmsDeletion', () => {
    it('is the account\'s own address, whatever its case or the spaces around it', () => {
        expect(confirmsDeletion('ada@example.com', 'ada@example.com')).toBe(true);
        expect(confirmsDeletion('  ADA@Example.com ', 'ada@example.com')).toBe(true);
    });

    it('is nothing else', () => {
        expect(confirmsDeletion('ada@example.co', 'ada@example.com')).toBe(false);
        expect(confirmsDeletion('', 'ada@example.com')).toBe(false);
        expect(confirmsDeletion('ada@example.com', null)).toBe(false);
        expect(confirmsDeletion({$ne: ''}, 'ada@example.com')).toBe(false);
        expect(confirmsDeletion('', '')).toBe(false);
    });
});
