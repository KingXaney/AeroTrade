import type {Metadata} from "next";
import {cookies} from "next/headers";
import Link from "next/link";
import {requireUserId} from "@/lib/auth/session";
import {getPortfoliosForUser} from "@/lib/trading/valuation";
import {getCachedAccountsForUser} from "@/lib/trading/accounts";
import {pickActiveAccount, pickActiveAccountId, preferredAccountId, toApplyAccounts} from "@/lib/trading/active-account";
import {getTradeLedger} from "@/lib/trading/ledger";
import {getCashApy} from "@/lib/income/page-store";
import {replayReceipts} from "@/lib/trading/receipts";
import {openLotNotes} from "@/lib/trading/lots";
import LastFill from "@/components/trading/desk/LastFill";
import TradeDesk from "@/components/trading/desk/TradeDesk";
import MarketStatus from "@/components/stocks/MarketStatus";
import TradingViewWidget from "@/components/stocks/TradingViewWidget";
import MarketScan, {isScanViewId} from "@/components/stocks/MarketScan";
import {MARKET_EMBEDS} from "@/lib/stocks/tradingview";
import {marketStatus} from "@/lib/prices/market-hours";
import {describeQueuedFill} from "@/lib/learn/copy/market";
import {MARKETS_PAGE_COPY} from "@/lib/learn/copy/trade";
import OpenPositionsStrip from "@/components/trading/desk/OpenPositionsStrip";
import AccountSwitcher from "@/components/trading/accounts/AccountSwitcher";
import Panel from "@/components/primitives/Panel";
import PageTitle from "@/components/primitives/PageTitle";
import SectionHeading from "@/components/primitives/SectionHeading";

// The browser tab's title; app/layout.tsx appends the app's name.
export const metadata: Metadata = {title: MARKETS_PAGE_COPY.title};

// The Markets page: the section's first page, since the Markets overview and the Trade Desk
// became one on 2026-10-13 (docs/specs/2026-10-13-markets-trade-merge.md). Top to bottom: the
// ticker tape, the desk (chart and ticket on one symbol), the last fill, the open positions, then
// the market scan — four TradingView views, one at a time in ?view=. /markets redirects here.
type TradePageProps = {
    searchParams: Promise<{symbol?: string; account?: string; view?: string}>;
};

const TradePage = async ({searchParams}: TradePageProps) => {
    const userId = await requireUserId();

    const {symbol: raw, account: accountParam, view} = await searchParams;
    const chartSymbol = (raw || 'NASDAQ:AAPL').toUpperCase();
    // Bare ticker (drop exchange prefix) seeds the order panel.
    const orderSymbol = chartSymbol.includes(':') ? chartSymbol.split(':').pop()! : chartSymbol;
    const scanView = isScanViewId(view) ? view : 'stocks';

    // The active account is resolved from the unpriced accounts, so the ledger read runs beside
    // the pricing instead of after it. Both reads are the render's cache()d ones the (root)
    // layout's sidebar already made; getAccountsForUser creates the first account, so there
    // always is one.
    const accounts = await getCachedAccountsForUser(userId);
    const activeId = pickActiveAccountId(accounts.map((a) => String(a._id)), preferredAccountId(accountParam, await cookies()));
    if (!activeId) throw new Error('No paper account');

    // A failed ledger read hides what is drawn from it (the last fill, the lot notes) instead of
    // reading as an account with no fills.
    const [all, ledger, apy] = await Promise.all([
        getPortfoliosForUser(userId),
        getTradeLedger(userId, activeId).catch((error) => {
            console.error('Trade desk: reading the trade ledger failed:', error);
            return null;
        }),
        getCashApy(),
    ]);
    const active = pickActiveAccount(all, activeId);
    if (!active) throw new Error('No paper account');
    const portfolio = active.summary;
    const lastTrade = ledger?.at(-1) ?? null;
    const lastReceipt = ledger && lastTrade ? replayReceipts(ledger)[lastTrade.id] : undefined;
    const status = marketStatus();
    // Names only: the trade desk's switcher has never shown each account's return.
    const switcherAccounts = toApplyAccounts(all);

    return (
        <div className="space-y-4">
            <PageTitle
                title={MARKETS_PAGE_COPY.title}
                // Used to read "live prices" at 3 a.m. on a Sunday.
                subtitle={(
                    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span>{MARKETS_PAGE_COPY.subtitle}</span>
                        <MarketStatus status={status} />
                    </span>
                )}
                actions={(
                    <div className="flex items-center gap-3">
                        <AccountSwitcher accounts={switcherAccounts} activeId={activeId} />
                        <Link href="/portfolio" className="text-xs text-brand hover:underline font-mono">
                            {MARKETS_PAGE_COPY.fullPortfolio}
                        </Link>
                    </div>
                )}
            />

            {/* The market's pulse, always on: the one embed the overview kept above its views. */}
            <Panel pad={3}>
                <TradingViewWidget
                    scriptUrl={MARKET_EMBEDS.tickerTape.script}
                    config={MARKET_EMBEDS.tickerTape.config}
                    height={70}
                />
            </Panel>

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
            <Panel>
                <div className="flex items-center justify-between mb-4">
                    <SectionHeading spacing="none">
                        {MARKETS_PAGE_COPY.positionsHeading}
                    </SectionHeading>
                    <Link href="/portfolio" className="text-xs text-fg-muted hover:text-brand font-mono">
                        {MARKETS_PAGE_COPY.positionsLink}
                    </Link>
                </div>
                <OpenPositionsStrip positions={portfolio.positions} accountId={activeId} lotNotes={ledger ? openLotNotes(ledger) : undefined} />
            </Panel>

            {/* The scan: the four views the overview page had, one at a time, keeping the desk's symbol and account in every link. */}
            <MarketScan active={scanView} params={{symbol: raw, account: accountParam}} />
        </div>
    );
};

export default TradePage;
