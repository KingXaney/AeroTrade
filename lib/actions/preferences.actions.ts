'use server';

import {connectToDatabase} from "@/database/mongoose";
import UserPreferencesModel from "@/database/models/user-preferences.model";
import {getCurrentUserId} from "@/lib/actions/watchlist.actions";

// Every action derives the user from the session: preferences are never
// readable or writable for an arbitrary userId supplied by the caller.

export type NotificationPreferences = {
    emailNotifications: boolean;
    digestMode: 'personalized' | 'general';
    topicsInDigest: boolean;
};

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
    emailNotifications: true,
    digestMode: 'personalized',
    topicsInDigest: true,
};

export const getNotificationPreferences = async (): Promise<NotificationPreferences> => {
    try {
        const userId = await getCurrentUserId();
        if (!userId) return DEFAULT_NOTIFICATION_PREFERENCES;

        await connectToDatabase();
        const prefs = await UserPreferencesModel.findOne({userId}).lean();
        if (!prefs) return DEFAULT_NOTIFICATION_PREFERENCES;

        return {
            emailNotifications: prefs.emailNotifications !== false,
            digestMode: prefs.digestMode === 'general' ? 'general' : 'personalized',
            topicsInDigest: prefs.topicsInDigest !== false,
        };
    } catch (e) {
        console.error('Error fetching notification preferences:', e);
        return DEFAULT_NOTIFICATION_PREFERENCES;
    }
};

export const getEmailNotificationPreference = async (): Promise<boolean> =>
    (await getNotificationPreferences()).emailNotifications;

export const getDigestMode = async (): Promise<'personalized' | 'general'> =>
    (await getNotificationPreferences()).digestMode;

export const toggleEmailNotifications = async (enabled: boolean): Promise<{ success: boolean; enabled: boolean }> => {
    try {
        const userId = await getCurrentUserId();
        if (!userId) return {success: false, enabled: !enabled};

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

export const setDigestMode = async (
    mode: 'personalized' | 'general',
): Promise<{ success: boolean; mode: 'personalized' | 'general' }> => {
    try {
        const userId = await getCurrentUserId();
        if (!userId) return {success: false, mode: mode === 'personalized' ? 'general' : 'personalized'};

        await connectToDatabase();
        await UserPreferencesModel.findOneAndUpdate(
            {userId},
            {digestMode: mode, updatedAt: new Date()},
            {upsert: true, new: true}
        );

        return {success: true, mode};
    } catch (e) {
        console.error('Error setting digest mode:', e);
        return {success: false, mode: mode === 'personalized' ? 'general' : 'personalized'};
    }
};

export const setTopicsInDigest = async (enabled: boolean): Promise<{ success: boolean; enabled: boolean }> => {
    try {
        const userId = await getCurrentUserId();
        if (!userId) return {success: false, enabled: !enabled};

        await connectToDatabase();
        await UserPreferencesModel.findOneAndUpdate(
            {userId},
            {topicsInDigest: enabled, updatedAt: new Date()},
            {upsert: true, new: true}
        );

        return {success: true, enabled};
    } catch (e) {
        console.error('Error setting topics-in-digest preference:', e);
        return {success: false, enabled: !enabled};
    }
};
