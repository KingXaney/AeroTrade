import {redirect} from "next/navigation";
import {getCurrentUserId} from "@/lib/actions/watchlist.actions";
import {getFriends, getIncomingRequests, getLeaderboard} from "@/lib/actions/friends.actions";
import AddFriend from "@/components/friends/AddFriend";
import FriendRequests from "@/components/friends/FriendRequests";
import FriendsList from "@/components/friends/FriendsList";
import Leaderboard from "@/components/friends/Leaderboard";

const FriendsPage = async () => {
    const userId = await getCurrentUserId();
    if (!userId) redirect('/sign-in');

    const [friends, requests, leaderboard] = await Promise.all([
        getFriends(userId),
        getIncomingRequests(userId),
        getLeaderboard(userId),
    ]);

    return (
        <div className="min-h-screen space-y-6">
            <div className="mb-2">
                <h1 className="text-2xl font-semibold text-[#e2e2e8] mb-1 tracking-tight" style={{fontFamily: 'var(--font-sora)'}}>
                    Friends &amp; Competition
                </h1>
                <p className="text-sm text-[#849495]" style={{fontFamily: 'var(--font-jetbrains)', letterSpacing: '0.02em'}}>
                    Connect with friends and see who&apos;s the best trader
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left: leaderboard (the competition) */}
                <div className="lg:col-span-2 space-y-6">
                    <Leaderboard entries={leaderboard} />
                </div>

                {/* Right: connections */}
                <div className="lg:col-span-1 space-y-6">
                    <AddFriend />
                    <FriendRequests requests={requests} />
                    <FriendsList friends={friends} />
                </div>
            </div>
        </div>
    );
};

export default FriendsPage;
