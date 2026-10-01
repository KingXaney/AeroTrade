import {describe, expect, it} from 'vitest';
import {MIGRATION_INDEXES, REPLACED_INDEXES} from '@/scripts/migration-indexes.mjs';
import PaperAccount from '@/database/models/paper-account.model';
import PaperTrade from '@/database/models/paper-trade.model';
import AccountSnapshot from '@/database/models/account-snapshot.model';
import BenchmarkSnapshot from '@/database/models/benchmark-snapshot.model';

type Declared = {collection: {collectionName: string}; schema: {indexes(): unknown[]}};

// The migration exists so production never relies on autoIndex; a list that drifts from the
// models rebuilds an index nothing reads and never builds the one the reads need.
const MODELS: Record<string, Declared> = {
    paperaccounts: PaperAccount,
    papertrades: PaperTrade,
    accountsnapshots: AccountSnapshot,
    benchmarksnapshots: BenchmarkSnapshot,
};

// Order-insensitive: the model's declaration order says nothing about the build.
const sorted = (specs: unknown[]) => specs.map((spec) => JSON.stringify(spec)).sort();

describe('migrate:accounts indexes', () => {
    it('covers each model it migrates by its own collection name', () => {
        expect(Object.keys(MIGRATION_INDEXES).sort())
            .toEqual(Object.values(MODELS).map((model) => model.collection.collectionName).sort());
    });

    it.each(Object.keys(MODELS))('builds exactly the indexes the %s model declares', (collection) => {
        const listed = MIGRATION_INDEXES[collection as keyof typeof MIGRATION_INDEXES];
        expect(sorted(listed)).toEqual(sorted(MODELS[collection].schema.indexes()));
    });

    it('drops the replaced descending trade index instead of rebuilding it', () => {
        expect(MIGRATION_INDEXES.papertrades.map(([key]) => key)).not.toContainEqual({accountId: 1, createdAt: -1});
        expect(REPLACED_INDEXES.papertrades).toEqual(['accountId_1_createdAt_-1']);
    });
});
