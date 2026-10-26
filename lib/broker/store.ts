// The Alpaca link's reads and writes (NOT a 'use server' module): one link per user, its status,
// and its syncs kept newest first. The actions and the job call these; the keys never touch them.

import BrokerLink, {type BrokerSyncDoc} from "@/database/models/broker-link.model";
import {connectToDatabase} from "@/database/mongoose";
import {MIRROR_SYNCS_KEPT} from "@/lib/broker/config";

export type BrokerSyncRecord = Omit<BrokerSyncDoc, 'at'> & {at: string};

export type BrokerLinkView = {
    id: string;
    userId: string;
    sourceAccountId: string;
    status: 'active' | 'paused';
    createdAt: string;
    syncs: BrokerSyncRecord[];
};

type LeanLink = {_id: unknown; userId: string; sourceAccountId: string; status: 'active' | 'paused'; createdAt?: Date; syncs?: BrokerSyncDoc[]};

const toView = (doc: LeanLink): BrokerLinkView => ({
    id: String(doc._id),
    userId: doc.userId,
    sourceAccountId: doc.sourceAccountId,
    status: doc.status,
    createdAt: (doc.createdAt ?? new Date(0)).toISOString(),
    syncs: (doc.syncs ?? []).map((sync) => ({
        day: sync.day, at: new Date(sync.at).toISOString(), kind: sync.kind, summary: sync.summary,
        orders: (sync.orders ?? []).map((order) => ({
            symbol: order.symbol, side: order.side, reason: order.reason, clientOrderId: order.clientOrderId, sent: order.sent, ok: order.ok,
            ...(typeof order.notional === 'number' ? {notional: order.notional} : {}),
            ...(typeof order.qty === 'number' ? {qty: order.qty} : {}),
            ...(order.status ? {status: order.status} : {}),
            ...(order.error ? {error: order.error} : {}),
        })),
        skipped: (sync.skipped ?? []).map((skip) => ({symbol: skip.symbol, reason: skip.reason})),
    })),
});

export const getBrokerLink = async (userId: string): Promise<BrokerLinkView | null> => {
    await connectToDatabase();
    const doc = await BrokerLink.findOne({userId}).lean<LeanLink | null>();
    return doc ? toView(doc) : null;
};

export const listActiveBrokerLinks = async (): Promise<BrokerLinkView[]> => {
    await connectToDatabase();
    const docs = await BrokerLink.find({status: 'active'}).lean<LeanLink[]>();
    return docs.map(toView);
};

// Links (or re-points) the user's mirror to an account of theirs, active.
export const saveBrokerLink = async (userId: string, sourceAccountId: string): Promise<void> => {
    await connectToDatabase();
    await BrokerLink.updateOne(
        {userId},
        {$set: {sourceAccountId, status: 'active'}, $setOnInsert: {provider: 'alpaca', syncs: []}},
        {upsert: true},
    );
};

export const setBrokerLinkStatus = async (userId: string, status: 'active' | 'paused'): Promise<boolean> => {
    await connectToDatabase();
    const result = await BrokerLink.updateOne({userId}, {$set: {status}});
    return result.matchedCount === 1;
};

// The link goes; the Alpaca account keeps whatever it holds.
export const deleteBrokerLink = async (userId: string): Promise<boolean> => {
    await connectToDatabase();
    const result = await BrokerLink.deleteOne({userId});
    return result.deletedCount === 1;
};

export const recordBrokerSync = async (userId: string, sync: Omit<BrokerSyncDoc, 'at'> & {at: Date}): Promise<void> => {
    await connectToDatabase();
    await BrokerLink.updateOne({userId}, {$push: {syncs: {$each: [sync], $position: 0, $slice: MIRROR_SYNCS_KEPT}}});
};
