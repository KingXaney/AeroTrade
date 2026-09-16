import {redirect} from "next/navigation";
import {cookies} from "next/headers";
import Link from "next/link";
import {ACTIVE_ACCOUNT_COOKIE} from "@/lib/constants";
import {getCurrentUserId} from "@/lib/actions/watchlist.actions";
import {getAccountsForUser, getPortfolio, toAccountSummary} from "@/lib/trading/account";
import TradeDesk from "@/components/trade/TradeDesk";
import MarketStatus from "@/components/system/MarketStatus";
import {marketStatus} from "@/lib/prices/market-hours";
import OpenPositionsStrip from "@/components/trade/OpenPositionsStrip";
import AccountSwitcher from "@/components/trade/AccountSwitcher";

type TradePageProps = {
    searchParams: Promise<{symbol?: string; account?: string}>;
};

const TradePage = async ({searchParams}: TradePageProps) => {
    const userId = await getCurrentUserId();
    if (!userId) redirect('/sign-in');

    const {symbol: raw, account: accountParam} = await searchParams;
    const chartSymbol = (raw || 'NASDAQ:AAPL').toUpperCase();
    // Bare ticker (drop exchange prefix) seeds the order panel.
    const orderSymbol = chartSymbol.includes(':') ? chartSymbol.split(':').pop()! : chartSymbol;

    // Active strategy account: ?account= wins, then the cookie, then the first account.
    const cookieStore = await cookies();
    const preferredId = accountParam ?? cookieStore.get(ACTIVE_ACCOUNT_COOKIE)?.value;
    const accounts = await getAccountsForUser(userId);
    const active = (preferredId && accounts.find((a) => String(a._id) === preferredId)) || accounts[0];
    const activeId = String(active._id);

    const portfolio = await getPortfolio(userId, activeId);
    const status = marketStatus();
    const switcherAccounts = accounts.map((a) => {
        const s = toAccountSummary(a);
        return {id: s.id, name: s.name};
    });

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-2">
                <div>
                    <h1 className="text-2xl font-semibold text-fg mb-1" style={{fontFamily: 'var(--type-display)'}}>
                        Trade Desk
                    </h1>
                    {/* Used to read "live prices" at 3 a.m. on a Sunday. */}
                    <p className="text-sm text-fg-muted flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span>Paper trading</span>
                        <MarketStatus status={status} />
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <AccountSwitcher accounts={switcherAccounts} activeId={activeId} />
                    <Link href="/portfolio" className="text-xs text-brand hover:underline" style={{fontFamily: 'var(--type-mono)'}}>
                        View full portfolio →
                    </Link>
                </div>
            </div>

            {/* Chart + order entry — the focus of this page; one symbol drives both */}
            <TradeDesk
                chartSymbol={chartSymbol}
                orderSymbol={orderSymbol}
                cash={portfolio.cash}
                accountId={activeId}
                positions={portfolio.positions.map((p) => ({symbol: p.symbol, quantity: p.quantity}))}
            />

            {/* Open positions — compact quick-sell; full holdings & history live on /portfolio */}
            <section className="glass-panel rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-brand" style={{fontFamily: 'var(--type-mono)'}}>
                        Open Positions
                    </h2>
                    <Link href="/portfolio" className="text-xs text-fg-muted hover:text-brand" style={{fontFamily: 'var(--type-mono)'}}>
                        Full holdings &amp; history →
                    </Link>
                </div>
                <OpenPositionsStrip positions={portfolio.positions} accountId={activeId} />
            </section>
        </div>
    );
};

export default TradePage;
