'use server';

import {connectToDatabase} from "@/database/mongoose";
import UserPreferencesModel from "@/database/models/user-preferences.model";

export const getAllUsersForNewsEmail = async () => {
    try {
        const mongoose = await connectToDatabase();
        const db = mongoose.connection.db;
        if(!db) throw new Error('Mongoose connection not connected');

        // Get all users who have opted out of email notifications
        const optedOutPrefs = await UserPreferencesModel.find(
            {emailNotifications: false},
            {userId: 1}
        );
        const optedOutUserIds = new Set(optedOutPrefs.map((p) => p.userId));

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
            .map((user) => ({
                id: user.id || user._id?.toString() || '',
                email: user.email,
                name: user.name
            }));
    } catch (e) {
        console.error('Error fetching users for news email:', e)
        return []
    }
}