// The strategy-account delete, with the models stubbed: an account the AI Navigator trades in
// is refused before anything is removed; any other owned account goes, children first.

import {beforeEach, describe, expect, it, vi} from 'vitest';

const db = vi.hoisted(() => ({
    accounts: new Map<string, {userId: string; name: string}>(),
    navigators: [] as {userId: string; accountId: string}[],
    deletes: [] as string[],
}));

vi.mock('@/database/mongoose', () => ({connectToDatabase: async () => undefined}));
vi.mock('@/lib/trading/accounts', () => ({
    getOwnedAccount: async (userId: string, accountId: string) => {
        const a = db.accounts.get(accountId);
        return a && a.userId === userId ? {_id: accountId, name: a.name} : null;
    },
}));
vi.mock('@/database/models/ai-navigator.model', () => ({
    default: {exists: async ({userId, accountId}: {userId: string; accountId: string}) =>
        db.navigators.some((n) => n.userId === userId && n.accountId === accountId) ? {_id: 'nav'} : null},
}));
vi.mock('@/database/models/paper-account.model', () => ({
    default: {
        countDocuments: async ({userId}: {userId: string}) => [...db.accounts.values()].filter((a) => a.userId === userId).length,
        deleteOne: async ({_id}: {_id: string}) => { db.deletes.push(`account:${_id}`); },
    },
}));
vi.mock('@/database/models/paper-trade.model', () => ({
    default: {deleteMany: async ({accountId}: {accountId: string}) => { db.deletes.push(`trades:${accountId}`); }},
}));
vi.mock('@/database/models/account-snapshot.model', () => ({
    default: {deleteMany: async ({accountId}: {accountId: string}) => { db.deletes.push(`snapshots:${accountId}`); }},
}));
vi.mock('@/database/models/account-income.model', () => ({
    default: {deleteMany: async ({accountId}: {accountId: string}) => { db.deletes.push(`income:${accountId}`); }},
}));

import {deleteOwnedAccount} from '@/lib/trading/lifecycle';

describe('deleteOwnedAccount', () => {
    beforeEach(() => {
        db.accounts = new Map([
            ['main', {userId: 'u1', name: 'Main Strategy'}],
            ['nav', {userId: 'u1', name: 'AI Navigator'}],
        ]);
        db.navigators = [{userId: 'u1', accountId: 'nav'}];
        db.deletes = [];
    });

    it('refuses the account the AI Navigator trades in, and removes nothing', async () => {
        const result = await deleteOwnedAccount('u1', 'nav');
        expect(result.success).toBe(false);
        expect(result.message).toMatch(/AI Navigator/);
        expect(result.message).toMatch(/unenroll/i);
        expect(db.deletes).toEqual([]);
    });

    it('deletes any other owned account, its rows before the account itself', async () => {
        const result = await deleteOwnedAccount('u1', 'main');
        expect(result).toMatchObject({success: true, deletedId: 'main'});
        expect(db.deletes).toEqual(['trades:main', 'snapshots:main', 'income:main', 'account:main']);
    });

    it('keeps the last account and refuses one the user does not own', async () => {
        db.accounts.delete('nav');
        db.navigators = [];
        expect((await deleteOwnedAccount('u1', 'main')).success).toBe(false);
        expect((await deleteOwnedAccount('u2', 'main')).message).toBe('Strategy account not found');
        expect(db.deletes).toEqual([]);
    });
});
