'use server';

import {connectToDatabase} from "@/database/mongoose";
import UserPreferencesModel from "@/database/models/user-preferences.model";

export const getAllUsersForNewsEmail = async () => {
    try {
        const mongoose = await connectToDatabase();
        const db = mongoose.connection.db;
        if(!db) throw new Error('Mongoose connection not connected');

        // One prefs pass: opt-out filter + each user's digest mode.
        const prefs = await UserPreferencesModel.find(
            {},
            {userId: 1, emailNotifications: 1, digestMode: 1, topicsInDigest: 1}
        );
        const optedOutUserIds = new Set(prefs.filter((p) => p.emailNotifications === false).map((p) => p.userId));
        const digestModeByUser = new Map<string, 'personalized' | 'general'>(
            prefs.map((p) => [p.userId, p.digestMode === 'general' ? 'general' : 'personalized'])
        );
        const topicsInDigestByUser = new Map<string, boolean>(prefs.map((p) => [p.userId, p.topicsInDigest !== false]));

        const users = await db.collection('user').find(
            { email: { $exists: true, $ne: null }},
            { projection: { _id: 1, id: 1, email: 1, name: 1, country:1 }}
        ).toArray();

        return users
            .filter((user) => user.email && user.name)
            .filter((user) => {
                const userId = user.id || user._id?.toString() || '';
                return !optedOutUserIds.has(userId);
            })
            .map((user) => {
                const id = user.id || user._id?.toString() || '';
                return {
                    id,
                    email: user.email,
                    name: user.name,
                    digestMode: digestModeByUser.get(id) ?? 'personalized',
                    topicsInDigest: topicsInDigestByUser.get(id) ?? true,
                };
            });
    } catch (e) {
        console.error('Error fetching users for news email:', e)
        return []
    }
}
