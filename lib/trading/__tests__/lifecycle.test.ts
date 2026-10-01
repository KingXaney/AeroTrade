// The strategy-account delete and restart, with the models stubbed. The delete refuses an account
// the AI Navigator trades in before anything is removed; any other owned account goes, children
// first. The restart sweeps the pre-migration trades only when asked.

import {beforeEach, describe, expect, it, vi} from 'vitest';

const db = vi.hoisted(() => ({
    accounts: new Map<string, {userId: string; name: string}>(),
    navigators: [] as {userId: string; accountId: string}[],
    deletes: [] as string[],
    writes: [] as string[],
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
        updateOne: async ({_id}: {_id: string}, update: {$set: {cash: number}}) => { db.writes.push(`account:${_id}:${update.$set.cash}`); },
    },
}));
vi.mock('@/database/models/paper-trade.model', () => ({
    default: {
        deleteMany: async (filter: {userId?: string; accountId?: string; $or?: {accountId?: unknown}[]}) => {
            db.deletes.push(filter.$or ? `trades:${filter.userId}:${String(filter.$or[0].accountId)}+legacy` : `trades:${filter.accountId}`);
        },
    },
}));
vi.mock('@/database/models/account-snapshot.model', () => ({
    default: {
        deleteMany: async ({accountId}: {accountId: string}) => { db.deletes.push(`snapshots:${accountId}`); },
        updateOne: async ({accountId}: {accountId: string}) => { db.writes.push(`seed:${accountId}`); },
    },
}));
vi.mock('@/database/models/account-income.model', () => ({
    default: {deleteMany: async ({accountId}: {accountId: string}) => { db.deletes.push(`income:${accountId}`); }},
}));

import {deleteOwnedAccount, restartAccount} from '@/lib/trading/lifecycle';

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

describe('restartAccount', () => {
    beforeEach(() => {
        db.accounts = new Map([
            ['main', {userId: 'u1', name: 'Main Strategy'}],
            ['nav', {userId: 'u1', name: 'AI Navigator'}],
        ]);
        db.deletes = [];
        db.writes = [];
    });

    it('resets the account, clears its rows and seeds day zero', async () => {
        await restartAccount('u1', {_id: 'nav'} as never, 50_000);
        expect(db.writes).toEqual(['account:nav:50000', 'seed:nav']);
        expect(db.deletes).toEqual(['trades:nav', 'snapshots:nav', 'income:nav']);
    });

    it('sweeps the user\'s pre-migration trades only when asked (the learner\'s reset)', async () => {
        await restartAccount('u1', {_id: 'main'} as never, 100_000, {sweepLegacyTrades: true});
        expect(db.deletes).toEqual(['trades:u1:main+legacy', 'snapshots:main', 'income:main']);
    });
});
