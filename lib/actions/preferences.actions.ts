'use server';

import {connectToDatabase} from "@/database/mongoose";
import UserPreferencesModel from "@/database/models/user-preferences.model";

export const getEmailNotificationPreference = async (userId: string): Promise<boolean> => {
    try {
        await connectToDatabase();

        const prefs = await UserPreferencesModel.findOne({userId});
        // Default to true (opted-in) if no record exists
        return prefs ? prefs.emailNotifications : true;
    } catch (e) {
        console.error('Error fetching email notification preference:', e);
        return true; // default to opted-in on error
    }
};

export const toggleEmailNotifications = async (userId: string, enabled: boolean): Promise<{ success: boolean; enabled: boolean }> => {
    try {
        await connectToDatabase();

        await UserPreferencesModel.findOneAndUpdate(
            {userId},
            {emailNotifications: enabled, updatedAt: new Date()},
            {upsert: true, new: true}
        );

        return {success: true, enabled};
    } catch (e) {
        console.error('Error toggling email notifications:', e);
        return {success: false, enabled: !enabled}; // return the opposite to indicate failure
    }
};
