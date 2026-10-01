import {cookies} from "next/headers";
import Link from "next/link";
import {requireUserId} from "@/lib/auth/session";
import {getPortfoliosForUser} from "@/lib/trading/valuation";
import {pickActiveAccount, preferredAccountId, toApplyAccounts} from "@/lib/trading/active-account";
import {getTradeLedger} from "@/lib/trading/ledger";
import {getCashApy} from "@/lib/income/page-store";
import {replayReceipts} from "@/lib/trading/receipts";
import {openLotNotes} from "@/lib/trading/lots";
import LastFill from "@/components/trade/LastFill";
import TradeDesk from "@/components/trade/TradeDesk";
import MarketStatus from "@/components/system/MarketStatus";
import {describeQueuedFill, marketStatus} from "@/lib/prices/market-hours";
import OpenPositionsStrip from "@/components/trade/OpenPositionsStrip";
import AccountSwitcher from "@/components/trade/AccountSwitcher";

type TradePageProps = {
    searchParams: Promise<{symbol?: string; account?: string}>;
};

const TradePage = async ({searchParams}: TradePageProps) => {
    const userId = await requireUserId();

    const {symbol: raw, account: accountParam} = await searchParams;
    const chartSymbol = (raw || 'NASDAQ:AAPL').toUpperCase();
    // Bare ticker (drop exchange prefix) seeds the order panel.
    const orderSymbol = chartSymbol.includes(':') ? chartSymbol.split(':').pop()! : chartSymbol;

    // Every account, priced: the same cache()d read the (root) layout's sidebar already made.
    const all = await getPortfoliosForUser(userId);
    const active = pickActiveAccount(all, preferredAccountId(accountParam, await cookies()));
    // getPortfoliosForUser creates the first account, so there always is one.
    if (!active) throw new Error('No strategy account');
    const activeId = active.account.id;
    const portfolio = active.summary;

    // A failed ledger read hides what is drawn from it (the last fill, the lot notes) instead of
    // reading as an account with no fills.
    const [ledger, apy] = await Promise.all([
        getTradeLedger(userId, activeId).catch((error) => {
            console.error('Trade desk: reading the trade ledger failed:', error);
            return null;
        }),
        getCashApy(),
    ]);
    const lastTrade = ledger?.at(-1) ?? null;
    const lastReceipt = ledger && lastTrade ? replayReceipts(ledger)[lastTrade.id] : undefined;
    const status = marketStatus();
    // Names only: the trade desk's switcher has never shown each account's return.
    const switcherAccounts = toApplyAccounts(all);

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
                positions={portfolio.positions.map((p) => ({symbol: p.symbol, quantity: p.quantity, marketValue: p.marketValue, avgCost: p.avgCost}))}
                queueNote={describeQueuedFill(status)}
                apy={apy}
            />

            {ledger && <LastFill trade={lastTrade} receipt={lastReceipt} />}

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
                <OpenPositionsStrip positions={portfolio.positions} accountId={activeId} lotNotes={ledger ? openLotNotes(ledger) : undefined} />
            </section>
        </div>
    );
};

export default TradePage;
