// The two writes every preference action shares. A plain server module on purpose — NOT
// 'use server': a server-action export that takes a userId would be an unauthenticated
// write endpoint. Callers connect to the database and derive userId from the session.

import UserPreferencesModel from "@/database/models/user-preferences.model";

export type UnsettablePreference = 'appearance' | 'dashboardLayout' | 'newsFeed' | 'followedStrategies';

// Two first-time upserts (theme + layout saved together) can race on the unique userId
// index; the second attempt finds the document and updates it.
export const upsertPreferences = async (userId: string, update: Record<string, unknown>): Promise<void> => {
    try {
        await UserPreferencesModel.findOneAndUpdate({userId}, update, {upsert: true});
    } catch (e) {
        if ((e as {code?: number}).code !== 11000) throw e;
        await UserPreferencesModel.findOneAndUpdate({userId}, update, {upsert: true});
    }
};

// Absence is the default for every optional preference, so a reset is a $unset — never a
// stored copy of the default that would go stale when the default changes.
export const unsetPreference = async (userId: string, field: UnsettablePreference): Promise<void> => {
    await UserPreferencesModel.updateOne({userId}, {$unset: {[field]: 1}, $set: {updatedAt: new Date()}});
};
