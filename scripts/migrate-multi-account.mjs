// One-shot, idempotent migration to multi-account paper trading.
//   1. Drops the old single-account unique index (userId_1) on paperaccounts
//   2. Backfills name + inceptionAt on existing accounts
//   3. Backfills accountId on existing papertrades (safe: <=1 account/user pre-migration)
//   4. Creates the new indexes explicitly (no reliance on Mongoose autoIndex in prod)
// Run with: npm run migrate:accounts
import 'dotenv/config';
import mongoose from 'mongoose';

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
        try {
            await accounts.dropIndex('userId_1');
            console.log('OK: dropped index userId_1');
        } catch (err) {
            if (err.codeName === 'IndexNotFound' || /index not found/i.test(err.message)) {
                console.log('SKIP: index userId_1 already gone');
            } else {
                throw err;
            }
        }

        // 2. Name + inceptionAt for pre-migration accounts (pipeline update so
        //    inceptionAt copies each account's own createdAt).
        const named = await accounts.updateMany(
            { name: { $exists: false } },
            [{ $set: { name: 'Main Strategy', inceptionAt: '$createdAt' } }],
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

        // 4. New indexes. No custom names: Mongoose autoIndex builds these same key specs
        //    under MongoDB's default names on app boot, and createIndex with a DIFFERENT
        //    name for an existing key spec fails with IndexOptionsConflict (code 85).
        //    Default names make this a true no-op in either run order.
        await accounts.createIndex({ userId: 1 });
        await accounts.createIndex({ userId: 1, name: 1 }, { unique: true });
        await trades.createIndex({ accountId: 1, createdAt: -1 });
        await db.collection('accountsnapshots').createIndex({ accountId: 1, date: 1 }, { unique: true });
        await db.collection('accountsnapshots').createIndex({ userId: 1 });
        await db.collection('benchmarksnapshots').createIndex({ symbol: 1, date: 1 }, { unique: true });
        console.log('OK: ensured new indexes');

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
