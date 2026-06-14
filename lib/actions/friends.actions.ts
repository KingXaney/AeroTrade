'use server';

import {revalidatePath} from "next/cache";
import {Types} from "mongoose";
import type {Db} from "mongodb";
import {connectToDatabase} from "@/database/mongoose";
import Friendship from "@/database/models/friendship.model";
import PaperAccount from "@/database/models/paper-account.model";
import {PAPER_STARTING_BALANCE} from "@/lib/constants";
import {getCurrentUserId} from "@/lib/actions/watchlist.actions";
import {buildPriceMap, computePortfolio, getPortfolio, type AccountLike} from "@/lib/trading/account";

// ============================================================================
// --- Internal helpers (not exported — free to be non-async / return non-plain) ---
// ============================================================================

const getDb = async (): Promise<Db> => {
    const mongoose = await connectToDatabase();
    const db = mongoose.connection.db;
    if (!db) throw new Error('Mongoose connection not connected');
    return db;
};

type Profile = {id: string; name: string; email: string};

const normalizeId = (u: {id?: string; _id?: {toString(): string}}): string =>
    u.id || u._id?.toString() || '';

// Resolve the session-equivalent id + profile for a user looked up by email.
const findUserByEmail = async (db: Db, email: string): Promise<Profile | null> => {
    const clean = email.trim().toLowerCase();
    const u = await db.collection('user').findOne({email: clean});
    if (!u) return null;
    return {id: normalizeId(u), name: u.name || clean, email: u.email || clean};
};

// Fetch {id,name,email} for a set of session ids (stored as user._id or an `id` field).
const getProfilesByIds = async (db: Db, ids: string[]): Promise<Map<string, Profile>> => {
    const map = new Map<string, Profile>();
    if (ids.length === 0) return map;
    const objectIds = ids.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));
    const docs = await db
        .collection('user')
        .find({$or: [{_id: {$in: objectIds}}, {id: {$in: ids}}]})
        .toArray();
    for (const u of docs) {
        const id = normalizeId(u);
        map.set(id, {id, name: u.name || u.email || 'Unknown', email: u.email || ''});
    }
    return map;
};

// Accepted friend ids for a user (either direction of the friendship).
const getAcceptedFriendIds = async (userId: string): Promise<string[]> => {
    const links = await Friendship.find({
        status: 'accepted',
        $or: [{requesterId: userId}, {addresseeId: userId}],
    }).lean();
    return links.map((l) => (l.requesterId === userId ? l.addresseeId : l.requesterId));
};

const areFriends = async (a: string, b: string): Promise<boolean> => {
    const link = await Friendship.findOne({
        status: 'accepted',
        $or: [
            {requesterId: a, addresseeId: b},
            {requesterId: b, addresseeId: a},
        ],
    }).lean();
    return !!link;
};

// ============================================================================
// --- Mutations (client-callable) ---
// ============================================================================

export const sendFriendRequest = async (email: string): Promise<OrderResult> => {
    try {
        const userId = await getCurrentUserId();
        if (!userId) return {success: false, message: 'Not authenticated'};

        const db = await getDb();
        const target = await findUserByEmail(db, email);
        if (!target) return {success: false, message: 'No user found with that email'};
        if (target.id === userId) return {success: false, message: "You can't add yourself"};

        const existing = await Friendship.findOne({
            $or: [
                {requesterId: userId, addresseeId: target.id},
                {requesterId: target.id, addresseeId: userId},
            ],
        }).lean();
        if (existing) {
            return {
                success: false,
                message: existing.status === 'accepted' ? 'You are already friends' : 'A request is already pending',
            };
        }

        await Friendship.create({requesterId: userId, addresseeId: target.id, status: 'pending'});
        revalidatePath('/friends');
        return {success: true, message: `Friend request sent to ${target.name}`};
    } catch (error) {
        console.error('Error sending friend request:', error);
        return {success: false, message: 'Could not send request'};
    }
};

export const respondToFriendRequest = async (friendshipId: string, accept: boolean): Promise<OrderResult> => {
    try {
        const userId = await getCurrentUserId();
        if (!userId) return {success: false, message: 'Not authenticated'};
        if (!Types.ObjectId.isValid(friendshipId)) return {success: false, message: 'Invalid request'};

        await connectToDatabase();
        const link = await Friendship.findById(friendshipId);
        if (!link || link.addresseeId !== userId || link.status !== 'pending') {
            return {success: false, message: 'Request not found'};
        }

        if (accept) {
            link.status = 'accepted';
            await link.save();
        } else {
            await link.deleteOne();
        }
        revalidatePath('/friends');
        return {success: true, message: accept ? 'Friend added' : 'Request declined'};
    } catch (error) {
        console.error('Error responding to friend request:', error);
        return {success: false, message: 'Could not update request'};
    }
};

export const removeFriend = async (friendshipId: string): Promise<OrderResult> => {
    try {
        const userId = await getCurrentUserId();
        if (!userId) return {success: false, message: 'Not authenticated'};
        if (!Types.ObjectId.isValid(friendshipId)) return {success: false, message: 'Invalid request'};

        await connectToDatabase();
        const link = await Friendship.findById(friendshipId);
        if (!link || (link.requesterId !== userId && link.addresseeId !== userId)) {
            return {success: false, message: 'Friend not found'};
        }
        await link.deleteOne();
        revalidatePath('/friends');
        return {success: true, message: 'Friend removed'};
    } catch (error) {
        console.error('Error removing friend:', error);
        return {success: false, message: 'Could not remove friend'};
    }
};

// ============================================================================
// --- Readers (server components) ---
// ============================================================================

export const getIncomingRequests = async (userId: string): Promise<FriendRequest[]> => {
    try {
        const db = await getDb();
        const links = await Friendship.find({addresseeId: userId, status: 'pending'}).sort({createdAt: -1}).lean();
        if (links.length === 0) return [];
        const profiles = await getProfilesByIds(db, links.map((l) => l.requesterId));
        return links.map((l) => {
            const p = profiles.get(l.requesterId);
            return {
                friendshipId: String(l._id),
                requesterId: l.requesterId,
                name: p?.name || 'Unknown',
                email: p?.email || '',
                createdAt: new Date(l.createdAt).getTime(),
            };
        });
    } catch (error) {
        console.error('Error fetching incoming requests:', error);
        return [];
    }
};

export const getFriends = async (userId: string): Promise<FriendSummary[]> => {
    try {
        const db = await getDb();
        const links = await Friendship.find({
            status: 'accepted',
            $or: [{requesterId: userId}, {addresseeId: userId}],
        }).lean();
        if (links.length === 0) return [];
        const otherIds = links.map((l) => (l.requesterId === userId ? l.addresseeId : l.requesterId));
        const profiles = await getProfilesByIds(db, otherIds);
        return links.map((l) => {
            const otherId = l.requesterId === userId ? l.addresseeId : l.requesterId;
            const p = profiles.get(otherId);
            return {
                friendshipId: String(l._id),
                id: otherId,
                name: p?.name || 'Unknown',
                email: p?.email || '',
            };
        });
    } catch (error) {
        console.error('Error fetching friends:', error);
        return [];
    }
};

// You + accepted friends, ranked by total return %. Prices all accounts from one shared map.
export const getLeaderboard = async (userId: string): Promise<LeaderboardEntry[]> => {
    try {
        const db = await getDb();
        const friendIds = await getAcceptedFriendIds(userId);
        const allIds = Array.from(new Set([userId, ...friendIds]));

        const [accounts, profiles] = await Promise.all([
            PaperAccount.find({userId: {$in: allIds}}).lean(),
            getProfilesByIds(db, allIds),
        ]);
        const accountByUser = new Map(accounts.map((a) => [a.userId, a]));

        const allSymbols = accounts.flatMap((a) => a.positions.map((p: PaperPosition) => p.symbol));
        const priceMap = await buildPriceMap(allSymbols);

        const rows: LeaderboardEntry[] = allIds.map((id) => {
            const stored = accountByUser.get(id);
            const account: AccountLike = stored
                ? {
                    cash: stored.cash,
                    startingBalance: stored.startingBalance,
                    positions: stored.positions.map((p: PaperPosition) => ({symbol: p.symbol, company: p.company, quantity: p.quantity, avgCost: p.avgCost})),
                }
                : {cash: PAPER_STARTING_BALANCE, startingBalance: PAPER_STARTING_BALANCE, positions: []};
            const portfolio = computePortfolio(account, priceMap);
            return {
                id,
                name: id === userId ? 'You' : profiles.get(id)?.name || 'Unknown',
                isYou: id === userId,
                totalValue: portfolio.totalValue,
                totalReturnPct: portfolio.totalReturnPct,
            };
        });

        return rows.sort((a, b) => b.totalReturnPct - a.totalReturnPct);
    } catch (error) {
        console.error('Error building leaderboard:', error);
        return [];
    }
};

// A friend's profile + portfolio — only if an accepted friendship exists.
export const getFriendProfile = async (friendId: string, viewerId: string): Promise<FriendProfile | null> => {
    try {
        if (friendId === viewerId) return null;
        if (!(await areFriends(viewerId, friendId))) return null;

        const db = await getDb();
        const profiles = await getProfilesByIds(db, [friendId]);
        const profile = profiles.get(friendId);
        if (!profile) return null;

        const portfolio = await getPortfolio(friendId);
        return {id: friendId, name: profile.name, email: profile.email, portfolio};
    } catch (error) {
        console.error('Error fetching friend profile:', error);
        return null;
    }
};
