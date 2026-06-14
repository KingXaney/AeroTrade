import Link from "next/link";
import {notFound, redirect} from "next/navigation";
import {getCurrentUserId} from "@/lib/actions/watchlist.actions";
import {getFriendProfile} from "@/lib/actions/friends.actions";
import AccountSummary from "@/components/trade/AccountSummary";
import PortfolioHoldings from "@/components/trade/PortfolioHoldings";

type FriendProfilePageProps = {
    params: Promise<{id: string}>;
};

const FriendProfilePage = async ({params}: FriendProfilePageProps) => {
    const viewerId = await getCurrentUserId();
    if (!viewerId) redirect('/sign-in');

    const {id} = await params;
    const profile = await getFriendProfile(id, viewerId);
    // Not an accepted friend (or no such user) -> hide.
    if (!profile) notFound();

    return (
        <div className="min-h-screen space-y-6">
            <div className="flex items-center gap-3">
                <Link href="/friends" className="text-[#849495] hover:text-[#7df4ff] transition-colors">
                    <span className="material-symbols-outlined">arrow_back</span>
                </Link>
                <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full flex items-center justify-center text-base font-bold"
                         style={{backgroundColor: '#00f0ff', color: '#002022', fontFamily: 'var(--font-sora)'}}>
                        {profile.name?.[0]?.toUpperCase() ?? '?'}
                    </div>
                    <div>
                        <h1 className="text-2xl font-semibold text-[#e2e2e8] tracking-tight" style={{fontFamily: 'var(--font-sora)'}}>
                            {profile.name}
                        </h1>
                        <p className="text-xs text-[#849495]" style={{fontFamily: 'var(--font-jetbrains)'}}>{profile.email}</p>
                    </div>
                </div>
            </div>

            <AccountSummary portfolio={profile.portfolio} />

            <section className="glass-panel rounded-xl p-5">
                <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-[#7df4ff] mb-4" style={{fontFamily: 'var(--font-jetbrains)'}}>
                    {profile.name}&apos;s Holdings
                </h2>
                <PortfolioHoldings positions={profile.portfolio.positions} emptyText={`${profile.name} has no open positions yet.`} />
            </section>
        </div>
    );
};

export default FriendProfilePage;
