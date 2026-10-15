// Who trades in an account besides its owner: the AI Navigator (one account per user), or a
// culture picker the user enrolled with (lib/culture/follow-store.ts). Read by /portfolio for the
// line under the account's name and for the "What the picker saw" its culture fills carry.
// Server-only (DB-bound); the same two rows the delete refusal in lib/trading/lifecycle.ts reads.

import AiNavigator from "@/database/models/ai-navigator.model";
import {connectToDatabase} from "@/database/mongoose";
import type {ProfileId} from "@/lib/culture/config";
import {getFollowByAccount} from "@/lib/culture/follow-store";

export type TradedBy =
    | {kind: 'navigator'}
    | {kind: 'culture'; profile: ProfileId; status: 'active' | 'paused'}
    | null;

export const tradedBy = async (userId: string, accountId: string): Promise<TradedBy> => {
    await connectToDatabase();
    if (await AiNavigator.exists({userId, accountId})) return {kind: 'navigator'};
    const follow = await getFollowByAccount(userId, accountId);
    return follow ? {kind: 'culture', profile: follow.profile, status: follow.status} : null;
};
