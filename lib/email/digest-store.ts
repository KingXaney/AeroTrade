// The daily brief's once-a-day claim (database/models/digest-send.model.ts). A plain server
// module, NOT 'use server': only the daily-news job calls it.

import {connectToDatabase} from "@/database/mongoose";
import {indexGuard} from "@/database/index-guard";
import DigestSend from "@/database/models/digest-send.model";

const isDuplicateKey = (error: unknown): boolean => (error as {code?: unknown})?.code === 11000;

// The claim IS the unique {userId, day} index: without it two runs would both insert, and both
// mail. So the index is asked for before the first claim (database/index-guard.ts, never
// Model.init()), and a claim made without it is refused rather than risked: the step throws,
// and its retry asks again.
const indexed = indexGuard(DigestSend);

// True when this call took the reader's brief for the day; false when another run already had.
export const claimDigestDay = async (userId: string, day: string): Promise<boolean> => {
    await connectToDatabase();
    if (!(await indexed())) throw new Error('The daily brief\'s claim index is not ready');
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
