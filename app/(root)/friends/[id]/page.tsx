import type {Metadata} from "next";
import Link from "next/link";
import {notFound} from "next/navigation";
import {cn} from "@/lib/utils";
import {formatPct, formatPrice, getChangeColorClass} from "@/lib/format";
import {requireUserId} from "@/lib/auth/session";
import {getFriendProfile} from "@/lib/friends/store";
import {unpricedLabel} from "@/lib/trading/analytics";
import AccountSummary from "@/components/trading/portfolio/AccountSummary";
import HoldingsTable from "@/components/trading/portfolio/HoldingsTable";
import Panel from "@/components/primitives/Panel";
import RowCard from "@/components/primitives/RowCard";
import SectionHeading from "@/components/primitives/SectionHeading";

// The browser tab's title; app/layout.tsx appends the app's name.
export const metadata: Metadata = {title: "Friends"};

type FriendProfilePageProps = {
    params: Promise<{id: string}>;
};

const FriendProfilePage = async ({params}: FriendProfilePageProps) => {
    const viewerId = await requireUserId();

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
                    <div className="w-11 h-11 rounded-full flex items-center justify-center text-base font-bold font-heading bg-brand-strong text-on-brand">
                        {profile.name?.[0]?.toUpperCase() ?? '?'}
                    </div>
                    <div>
                        <h1 className="text-2xl font-semibold text-fg tracking-tight font-heading">
                            {profile.name}
                        </h1>
                        <p className="text-xs text-fg-muted font-mono">{profile.email}</p>
                    </div>
                </div>
            </div>

            {/* Best account, shown in full */}
            <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-base text-brand">account_tree</span>
                <span className="label-type text-xs text-fg-muted">
                    Best account · <span className="text-fg">{profile.accountName}</span>
                </span>
            </div>
            <AccountSummary portfolio={profile.portfolio} definitions />

            {/* All accounts at a glance */}
            {profile.accounts.length > 1 && (
                <Panel>
                    <SectionHeading>
                        Accounts
                    </SectionHeading>
                    <div className="space-y-1.5">
                        {profile.accounts.map((a) => (
                            <RowCard key={a.name} className="flex items-center justify-between">
                                <span className="text-sm text-fg font-mono">{a.name}</span>
                                <div className="text-right font-mono">
                                    <span className="text-sm text-fg mr-3">{formatPrice(a.totalValue)}</span>
                                    <span className={cn('text-xs', getChangeColorClass(a.totalReturnPct))}>
                                        {formatPct(a.totalReturnPct)}
                                    </span>
                                    {unpricedLabel(a.unpriced, a.holdings) && (
                                        <span className="block text-[10px] text-warning">{unpricedLabel(a.unpriced, a.holdings)}</span>
                                    )}
                                </div>
                            </RowCard>
                        ))}
                    </div>
                </Panel>
            )}

            <Panel>
                <SectionHeading>
                    {profile.name}&apos;s Holdings
                </SectionHeading>
                <HoldingsTable positions={profile.portfolio.positions} emptyText={`${profile.name} has no open positions yet.`} />
            </Panel>
        </div>
    );
};

export default FriendProfilePage;
