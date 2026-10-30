// One-shot, idempotent migration to multi-account paper trading, and the ledger repairs since.
//   1. Drops the old single-account unique index (userId_1) on paperaccounts
//   2. Backfills name + inceptionAt on existing accounts
//   3. Backfills accountId on existing papertrades (safe: <=1 account/user pre-migration)
//   4. Removes income rows written twice (scripts/income-dedupe.mjs) and takes them off the
//      cash, income totals and snapshots that counted them, one transaction per account
//   5. Creates the indexes the models declare explicitly (no reliance on Mongoose autoIndex in prod)
//   6. Drops the indexes those models replaced (Mongoose never drops one)
// Run with: npm run migrate:accounts
// Look first with: npm run migrate:accounts -- --dry-run (writes nothing; prints step 4's plan)
import 'dotenv/config';
import mongoose from 'mongoose';
import {MIGRATION_INDEXES, REPLACED_INDEXES} from './migration-indexes.mjs';
import {planIncomeDedupe} from './income-dedupe.mjs';

const DRY_RUN = process.argv.includes('--dry-run');

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

const money = (value) => `$${value.toFixed(2)}`;

// Step 4. Accounts holding an income key twice, each repaired in one transaction, and only when
// its books then rebuild exactly from its trades and its distinct credits (income-dedupe.mjs).
// Returns how many accounts still hold copies, which keeps the unique index from building.
async function dedupeIncome(db) {
    const income = db.collection('accountincomes');
    const accounts = db.collection('paperaccounts');
    const trades = db.collection('papertrades');
    const snapshots = db.collection('accountsnapshots');
    const affected = await income.aggregate([
        {$group: {_id: {accountId: '$accountId', epoch: '$epoch', kind: '$kind', date: '$date', symbol: '$symbol'}, n: {$sum: 1}}},
        {$match: {n: {$gt: 1}}},
        {$group: {_id: '$_id.accountId'}},
        {$sort: {_id: 1}},
    ], {allowDiskUse: true}).toArray();
    if (affected.length === 0) {
        console.log('OK: every income row is recorded once');
        return 0;
    }

    let left = 0;
    for (const {_id: accountId} of affected) {
        const rows = await income.find({accountId}).toArray();
        const account = mongoose.isValidObjectId(accountId)
            ? await accounts.findOne({_id: new mongoose.Types.ObjectId(accountId)})
            : null;
        const label = `${account?.name ?? 'deleted account'} (…${String(accountId).slice(-6)})`;

        if (!account) {
            // A deleted account's leftovers: the copies go, there is no cash to give back.
            const plan = planIncomeDedupe({rows, account: {epoch: Number.NaN, incomeThrough: null, cash: 0, startingBalance: 0}, tradeCash: 0, snapshots: []});
            console.log(`${DRY_RUN ? 'PLAN' : 'FIX'}: ${label}: ${plan.copies} copied row(s) removed`);
            if (!DRY_RUN) await income.deleteMany({_id: {$in: plan.remove}});
            continue;
        }

        const inceptionAt = new Date(account.inceptionAt ?? account.createdAt);
        const tradeCash = (await trades.find({accountId, createdAt: {$gte: inceptionAt}}, {projection: {side: 1, total: 1}}).toArray())
            .reduce((sum, trade) => sum + (trade.side === 'sell' ? trade.total : -trade.total), 0);
        const stamps = await snapshots.find({accountId}, {projection: {date: 1, epoch: 1, incomeThrough: 1}}).toArray();
        const plan = planIncomeDedupe({
            rows,
            account: {epoch: inceptionAt.getTime(), incomeThrough: account.incomeThrough ?? null, cash: account.cash, startingBalance: account.startingBalance},
            tradeCash,
            snapshots: stamps,
        });
        const books = plan.mode === 'credited'
            ? `interest −${money(plan.credited.interest)}, dividends −${money(plan.credited.dividends)}, cash ${money(account.cash)} → ${money(plan.cashAfter)}, ${plan.snapshots.length} snapshot(s) lowered`
            : plan.mode === 'uncredited' ? 'never credited, cash unchanged' : `cash ${money(account.cash)} rebuilds to neither ${money(plan.expectedCash)} nor that plus the copies`;
        console.log(`${DRY_RUN ? 'PLAN' : 'FIX'}: ${label}: ${plan.copies} copied row(s); ${books}`);
        if (!plan.reconciles) {
            console.log(`SKIP: ${label} does not reconcile; left as it is`);
            left += 1;
            continue;
        }
        if (DRY_RUN) continue;

        const session = mongoose.connection.getClient().startSession();
        try {
            await session.withTransaction(async () => {
                const {exact} = plan.credited;
                const moved = await accounts.updateOne(
                    {_id: account._id, cash: account.cash, incomeThrough: account.incomeThrough ?? {$exists: false}},
                    {$inc: {cash: -exact.total, 'incomeTotals.interest': -exact.interest, 'incomeTotals.dividends': -exact.dividends}},
                    {session},
                );
                if (moved.matchedCount !== 1) throw new Error('the account changed while the repair was planned');
                await income.deleteMany({_id: {$in: plan.remove}}, {session});
                for (const fix of plan.snapshots) {
                    await snapshots.updateOne({_id: fix._id}, {$inc: {cash: -fix.delta, totalValue: -fix.delta}}, {session});
                }
            });
        } catch (err) {
            console.log(`SKIP: ${label}: ${err.message}; run the migration again`);
            left += 1;
        } finally {
            await session.endSession();
        }
    }
    return left;
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

        if (DRY_RUN) {
            console.log(`DRY RUN on ${db.databaseName}: nothing is written`);
            const unnamed = await accounts.countDocuments({ name: { $exists: false } });
            const unassigned = await trades.countDocuments({ accountId: { $exists: false } });
            console.log(`PLAN: backfill name/inceptionAt on ${unnamed} account(s), accountId on ${unassigned} trade(s)`);
            const left = await dedupeIncome(db);
            console.log(`PLAN: ensure the indexes of ${Object.keys(MIGRATION_INDEXES).join(', ')}${left > 0 ? ` (the income key's unique index waits: ${left} account(s) would still hold copies)` : ''}`);
            await mongoose.connection.close();
            process.exit(0);
        }

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

        // 4. One income row per key, before step 5 makes the key unique.
        const left = await dedupeIncome(db);

        // 5. The models' indexes, under MongoDB's default names (see migration-indexes.mjs).
        //    The income key's unique index cannot build while an account still holds a copy.
        for (const [name, specs] of Object.entries(MIGRATION_INDEXES)) {
            if (name === 'accountincomes' && left > 0) {
                console.log(`SKIP: accountincomes indexes wait until ${left} account(s) are repaired`);
                continue;
            }
            for (const [key, options] of specs) {
                await db.collection(name).createIndex(key, options);
            }
        }
        console.log('OK: ensured the models\' indexes');

        // 6. Replaced indexes, dropped only now so their replacements already serve the reads.
        for (const [name, indexNames] of Object.entries(REPLACED_INDEXES)) {
            for (const indexName of indexNames) {
                await dropIfPresent(db.collection(name), indexName);
            }
        }

        console.log(`DONE: migrated ${named.modifiedCount} account(s), ${tradesBackfilled} trade(s)${left > 0 ? `; ${left} account(s) left to repair` : ''}`);
        await mongoose.connection.close();
        process.exit(left > 0 ? 1 : 0);
    } catch (err) {
        console.error('ERROR: migration failed');
        console.error(err);
        try { await mongoose.connection.close(); } catch {}
        process.exit(1);
    }
}

main();
