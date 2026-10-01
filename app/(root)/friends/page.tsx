import {requireUserId} from "@/lib/auth/session";
import {getFriends, getIncomingRequests, getLeaderboard, getOutgoingRequests} from "@/lib/friends/store";
import AddFriend from "@/components/friends/AddFriend";
import FriendRequests from "@/components/friends/FriendRequests";
import SentRequests from "@/components/friends/SentRequests";
import FriendsList from "@/components/friends/FriendsList";
import Leaderboard from "@/components/friends/Leaderboard";
import PageTitle from "@/components/primitives/PageTitle";

const FriendsPage = async () => {
    const userId = await requireUserId();

    const [friends, requests, sent, leaderboard] = await Promise.all([
        getFriends(userId),
        getIncomingRequests(userId),
        getOutgoingRequests(userId),
        getLeaderboard(userId),
    ]);

    return (
        <div className="space-y-6">
            <PageTitle title="Friends & Competition" subtitle="Connect with friends and see who's the best trader" />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left: leaderboard (the competition) */}
                <div className="lg:col-span-2 space-y-6">
                    <Leaderboard entries={leaderboard} />
                </div>

                {/* Right: connections */}
                <div className="lg:col-span-1 space-y-6">
                    <AddFriend />
                    <FriendRequests requests={requests} />
                    <SentRequests requests={sent} />
                    <FriendsList friends={friends} />
                </div>
            </div>
        </div>
    );
};

export default FriendsPage;
