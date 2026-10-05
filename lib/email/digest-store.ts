// The daily brief's once-a-day claim (database/models/digest-send.model.ts). A plain server
// module, NOT 'use server': only the daily-news job calls it.

import {connectToDatabase} from "@/database/mongoose";
import DigestSend from "@/database/models/digest-send.model";

const isDuplicateKey = (error: unknown): boolean => (error as {code?: unknown})?.code === 11000;

// True when this call took the reader's brief for the day; false when another run already had.
export const claimDigestDay = async (userId: string, day: string): Promise<boolean> => {
    await connectToDatabase();
    // The unique index must exist before the first insert can be refused by it.
    await DigestSend.init();
    try {
        await DigestSend.create({userId, day, sentAt: new Date()});
        return true;
    } catch (error) {
        if (isDuplicateKey(error)) return false;
        throw error;
    }
};

// A send that failed gives the day back, so the job's retry can mail it.
export const releaseDigestDay = async (userId: string, day: string): Promise<void> => {
    await connectToDatabase();
    await DigestSend.deleteOne({userId, day});
};
