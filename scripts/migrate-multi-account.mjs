// One-shot, idempotent migration to multi-account paper trading.
//   1. Drops the old single-account unique index (userId_1) on paperaccounts
//   2. Backfills name + inceptionAt on existing accounts
//   3. Backfills accountId on existing papertrades (safe: <=1 account/user pre-migration)
//   4. Creates the indexes the models declare explicitly (no reliance on Mongoose autoIndex in prod)
//   5. Drops the indexes those models replaced (Mongoose never drops one)
// Run with: npm run migrate:accounts
import 'dotenv/config';
import mongoose from 'mongoose';
import {MIGRATION_INDEXES, REPLACED_INDEXES} from './migration-indexes.mjs';

// Re-runs find the index already gone; only that is skipped.
async function dropIfPresent(collection, name) {
    try {
        await collection.dropIndex(name);
        console.log(`OK: dropped index ${collection.collectionName}.${name}`);
    } catch (err) {
        if (err.codeName === 'IndexNotFound' || /index not found/i.test(err.message)) {
            console.log(`SKIP: index ${collection.collectionName}.${name} already gone`);
        } else {
            throw err;
        }
    }
}

async function main() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('ERROR: MONGODB_URI must be set in .env');
        process.exit(1);
    }

    try {
        await mongoose.connect(uri, { bufferCommands: false });
        const db = mongoose.connection.db;
        const accounts = db.collection('paperaccounts');
        const trades = db.collection('papertrades');

        // 1. Drop the single-account constraint (ignore "not found" on re-runs).
        await dropIfPresent(accounts, 'userId_1');

        // 2. Name + inceptionAt for pre-migration accounts (pipeline update so
        //    inceptionAt copies each account's own createdAt).
        const named = await accounts.updateMany(
            { name: { $exists: false } },
            [{ $set: { name: 'Main account', inceptionAt: '$createdAt' } }],   // = DEFAULT_ACCOUNT_NAME
        );
        console.log(`OK: backfilled name/inceptionAt on ${named.modifiedCount} account(s)`);

        // 3. accountId on trades. Pre-migration each user had at most one account,
        //    so every legacy trade belongs to that user's single account.
        let tradesBackfilled = 0;
        const cursor = accounts.find({}, { projection: { _id: 1, userId: 1 } });
        for await (const acct of cursor) {
            const res = await trades.updateMany(
                { userId: acct.userId, accountId: { $exists: false } },
                { $set: { accountId: String(acct._id) } },
            );
            tradesBackfilled += res.modifiedCount;
        }
        console.log(`OK: backfilled accountId on ${tradesBackfilled} trade(s)`);

        // 4. The models' indexes, under MongoDB's default names (see migration-indexes.mjs).
        for (const [name, specs] of Object.entries(MIGRATION_INDEXES)) {
            for (const [key, options] of specs) {
                await db.collection(name).createIndex(key, options);
            }
        }
        console.log('OK: ensured the models\' indexes');

        // 5. Replaced indexes, dropped only now so their replacements already serve the reads.
        for (const [name, indexNames] of Object.entries(REPLACED_INDEXES)) {
            for (const indexName of indexNames) {
                await dropIfPresent(db.collection(name), indexName);
            }
        }

        console.log(`DONE: migrated ${named.modifiedCount} account(s), ${tradesBackfilled} trade(s)`);
        await mongoose.connection.close();
        process.exit(0);
    } catch (err) {
        console.error('ERROR: migration failed');
        console.error(err);
        try { await mongoose.connection.close(); } catch {}
        process.exit(1);
    }
}

main();
