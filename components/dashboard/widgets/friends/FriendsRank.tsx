import type {LeaderboardEntry} from '@/lib/friends/types';

const FriendsRank = ({leaderboard}: {leaderboard: LeaderboardEntry[]}) => {
    const myRank = leaderboard.findIndex((e) => e.isYou) + 1;
    const hasFriends = leaderboard.length > 1;
    return hasFriends ? (
        <>
            <div className="text-2xl font-semibold text-fg font-heading">#{myRank}</div>
            <div className="text-sm text-fg-muted mt-1 font-mono">of {leaderboard.length} traders</div>
            <div className="text-xs text-fg-muted mt-3 font-mono">Leader: {leaderboard[0]?.name}</div>
        </>
    ) : (
        <p className="text-sm text-fg-muted">Add friends to start competing on returns.</p>
    );
};

export default FriendsRank;
