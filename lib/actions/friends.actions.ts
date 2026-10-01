'use server';

import {revalidatePath} from "next/cache";
import {Types} from "mongoose";
import {connectToDatabase} from "@/database/mongoose";
import Friendship from "@/database/models/friendship.model";
import {getCurrentUserId} from "@/lib/auth/session";
import {findUserByEmail} from "@/lib/friends/store";

// The friends' writes, each for the signed-in user. The reads are lib/friends/store.ts.

export const sendFriendRequest = async (email: string): Promise<OrderResult> => {
    try {
        const userId = await getCurrentUserId();
        if (!userId) return {success: false, message: 'Not authenticated'};

        const target = await findUserByEmail(email);
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
