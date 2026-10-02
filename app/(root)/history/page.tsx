import Link from "next/link";
import {requireUserId} from "@/lib/auth/session";
import {getWatchlistForUser} from "@/lib/stocks/watchlist-store";
import {getRecentTradesForUser} from "@/lib/trading/ledger";
import TradeHistory from "@/components/trading/portfolio/TradeHistory";
import {WATCHLIST_COPY} from "@/lib/learn/copy/watchlist";
import {formatEasternTimestamp} from "@/lib/format";
import PageTitle from "@/components/primitives/PageTitle";
import Panel from '@/components/primitives/Panel';
import SectionHeading from "@/components/primitives/SectionHeading";

// Portfolio's Activity tab: what you did, across every account — the fills, and what you put on
// your watchlist and when. It used to end on six cards of the news feed, which has a page of
// its own.
const HistoryPage = async () => {
    const userId = await requireUserId();

    const [items, recent] = await Promise.all([getWatchlistForUser(userId), getRecentTradesForUser(userId)]);

    return (
        <div className="space-y-4">
            <PageTitle title="Activity" subtitle="Your trades across every account, and what you have added to your watchlist" />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
                {/* Removals are not recorded (the watchlist model hard-deletes), so the list
                    beside this is honest about being "by date added", not a timeline. */}
                <Panel pad={6} className="lg:col-span-2">
                    <SectionHeading size="xs">
                        Trades
                    </SectionHeading>
                    {recent ? (
                        <TradeHistory trades={recent.trades} totalCount={recent.total} />
                    ) : (
                        <p className="text-sm text-fg-muted p-4">Your trades could not be loaded right now — try again in a few minutes.</p>
                    )}
                </Panel>

                {/* Watchlist, by date added */}
                <Panel pad={6} className="lg:col-span-1">
                    <SectionHeading size="xs">
                        On your watchlist, by date added
                    </SectionHeading>

                    {!items ? (
                        <p className="text-sm text-fg-muted">{WATCHLIST_COPY.unavailable}</p>
                    ) : items.length === 0 ? (
                        <p className="text-sm text-fg-muted">
                            Nothing yet. Add a stock to your watchlist and it appears here with the date you added it.
                        </p>
                    ) : (
                        <ol className="relative space-y-5 border-l border-brand/15 pl-5">
                            {items.map((item) => (
                                <li key={item.symbol} className="relative">
                                    <span className="absolute -left-[1.4rem] top-1 w-2.5 h-2.5 rounded-full bg-brand" />
                                    <Link href={`/stocks/${item.symbol}`} className="group block">
                                        <p className="text-sm text-fg group-hover:text-brand transition-colors">
                                            Added <span className="font-semibold">{item.symbol}</span>
                                            <span className="text-fg-muted"> — {item.company}</span>
                                        </p>
                                        <p className="text-[11px] text-fg-muted mt-0.5 font-mono">
                                            {formatEasternTimestamp(item.addedAt, {year: true})}
                                        </p>
                                    </Link>
                                </li>
                            ))}
                        </ol>
                    )}
                </Panel>
            </div>
        </div>
    );
};

export default HistoryPage;
