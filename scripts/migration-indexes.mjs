// The indexes `npm run migrate:accounts` builds, per collection, as [key, options] — the shape
// Mongoose's schema.indexes() returns, so lib/__tests__/migration-indexes.test.ts can hold each
// list to exactly what its model declares. Plain JS with no imports: the script runs under node.
//
// No custom names: Mongoose autoIndex builds these same key specs under MongoDB's default names
// on app boot, and createIndex with a DIFFERENT name for an existing key spec fails with
// IndexOptionsConflict (code 85). Default names make the build a true no-op in either run order.
export const MIGRATION_INDEXES = {
    paperaccounts: [
        [{userId: 1}, {}],
        [{userId: 1, name: 1}, {unique: true}],
    ],
    papertrades: [
        [{userId: 1}, {}],
        [{accountId: 1}, {}],
        [{createdAt: 1}, {}],
        [{accountId: 1, createdAt: 1, _id: 1}, {}],
        [{userId: 1, source: 1, createdAt: 1}, {}],
        [{userId: 1, source: 1, side: 1, createdAt: 1}, {}],
        [{accountId: 1, idempotencyKey: 1}, {unique: true, partialFilterExpression: {idempotencyKey: {$exists: true}}}],
    ],
    accountsnapshots: [
        [{accountId: 1, date: 1}, {unique: true}],
        [{userId: 1}, {}],
    ],
    benchmarksnapshots: [
        [{symbol: 1, date: 1}, {unique: true}],
    ],
};

// Indexes a model has replaced, by name. Mongoose adds indexes but never drops them, so these
// stay on a deployment that built them — costing every write — until the migration drops them.
export const REPLACED_INDEXES = {
    // Served only the descending history read; {accountId, createdAt, _id} serves both directions.
    papertrades: ['accountId_1_createdAt_-1'],
};
