// The owner's user ids (lib/lab/owner.ts), for the reads that hold a user id and no reader: the
// jobs that trade an enrolled account (the AI Navigator, the culture pickers), once per run. A
// request reads the owner from its session instead. One read of better-auth's user collection by
// the listed emails, none when the list is empty. Server-only.

import type {Db} from "mongodb";
import {connectToDatabase} from "@/database/mongoose";
import {labOwnerEmails} from "@/lib/lab/owner";

const getDb = async (): Promise<Db> => {
    const mongoose = await connectToDatabase();
    const db = mongoose.connection.db;
    if (!db) throw new Error('Mongoose connection not connected');
    return db;
};

// A user's id is the session's: an `id` field where better-auth wrote one, else the _id.
export const readOwnerUserIds = async (): Promise<ReadonlySet<string>> => {
    const emails = labOwnerEmails();
    if (emails.length === 0) return new Set();
    const users = await (await getDb()).collection('user')
        .find({email: {$in: emails}}, {projection: {_id: 1, id: 1}})
        .toArray();
    return new Set(users.map((user) => (typeof user.id === 'string' && user.id) || String(user._id)));
};
