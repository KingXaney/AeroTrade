// Friends, requests and the leaderboard, as /friends and the dashboard read them.

export type FriendSummary = {
    friendshipId: string;
    id: string;
    name: string;
    email: string;
};

export type FriendRequest = {
    friendshipId: string;
    requesterId: string;
    name: string;
    email: string;
    createdAt: number;
};

/** A request this user sent that hasn't been answered yet. */
export type SentFriendRequest = {
    friendshipId: string;
    addresseeId: string;
    name: string;
    email: string;
    createdAt: number;
};

export type LeaderboardEntry = {
    id: string;
    name: string;
    isYou: boolean;
    totalValue: number;
    totalReturnPct: number;
    accountName: string;      // name of the user's best strategy account
    unpriced: number;         // holdings in that account with no live quote (their value is at cost)
    holdings: number;
};
