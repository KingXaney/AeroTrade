import type {LeaderboardEntry} from '@/lib/friends/types';

const FriendsRank = ({leaderboard}: {leaderboard: LeaderboardEntry[]}) => {
    const myRank = leaderboard.findIndex((e) => e.isYou) + 1;
    const hasFriends = leaderboard.length > 1;
    return hasFriends ? (
        <>
            <div className="text-2xl font-semibold text-fg" style={{fontFamily: 'var(--type-display)'}}>#{myRank}</div>
            <div className="text-sm text-fg-muted mt-1" style={{fontFamily: 'var(--type-mono)'}}>of {leaderboard.length} traders</div>
            <div className="text-xs text-fg-muted mt-3" style={{fontFamily: 'var(--type-mono)'}}>Leader: {leaderboard[0]?.name}</div>
        </>
    ) : (
        <p className="text-sm text-fg-muted">Add friends to start competing on returns.</p>
    );
};

export default FriendsRank;
