import Link from "next/link";
import {notFound, redirect} from "next/navigation";
import {cn, formatPrice, getChangeColorClass} from "@/lib/utils";
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
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <Link href="/friends" className="text-fg-muted hover:text-brand transition-colors">
                    <span className="material-symbols-outlined">arrow_back</span>
                </Link>
                <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full flex items-center justify-center text-base font-bold"
                         style={{backgroundColor: 'var(--brand-strong)', color: 'var(--on-brand)', fontFamily: 'var(--type-display)'}}>
                        {profile.name?.[0]?.toUpperCase() ?? '?'}
                    </div>
                    <div>
                        <h1 className="text-2xl font-semibold text-fg tracking-tight" style={{fontFamily: 'var(--type-display)'}}>
                            {profile.name}
                        </h1>
                        <p className="text-xs text-fg-muted" style={{fontFamily: 'var(--type-mono)'}}>{profile.email}</p>
                    </div>
                </div>
            </div>

            {/* Best strategy, shown in full */}
            <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-base text-brand">account_tree</span>
                <span className="text-xs uppercase tracking-[0.1em] text-fg-muted" style={{fontFamily: 'var(--type-mono)'}}>
                    Best strategy · <span className="text-fg">{profile.accountName}</span>
                </span>
            </div>
            <AccountSummary portfolio={profile.portfolio} />

            {/* All strategies at a glance */}
            {profile.accounts.length > 1 && (
                <section className="glass-panel rounded-xl p-5">
                    <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-brand mb-4" style={{fontFamily: 'var(--type-mono)'}}>
                        Strategies
                    </h2>
                    <div className="space-y-1.5">
                        {profile.accounts.map((a) => (
                            <div key={a.name}
                                 className="flex items-center justify-between px-4 py-3 rounded-lg border bg-surface-2/40 border-line-strong/20">
                                <span className="text-sm text-fg" style={{fontFamily: 'var(--type-mono)'}}>{a.name}</span>
                                <div className="text-right" style={{fontFamily: 'var(--type-mono)'}}>
                                    <span className="text-sm text-fg mr-3">{formatPrice(a.totalValue)}</span>
                                    <span className={cn('text-xs', getChangeColorClass(a.totalReturnPct || undefined))}>
                                        {a.totalReturnPct >= 0 ? '+' : ''}{a.totalReturnPct.toFixed(2)}%
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            <section className="glass-panel rounded-xl p-5">
                <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-brand mb-4" style={{fontFamily: 'var(--type-mono)'}}>
                    {profile.name}&apos;s Holdings
                </h2>
                <PortfolioHoldings positions={profile.portfolio.positions} emptyText={`${profile.name} has no open positions yet.`} />
            </section>
        </div>
    );
};

export default FriendProfilePage;
