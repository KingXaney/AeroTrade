import {redirect} from "next/navigation";
import TradingViewWidget from "@/components/TradingViewWidget";
import {TRADE_CHART_WIDGET_CONFIG, SYMBOL_INFO_WIDGET_CONFIG} from "@/lib/constants";
import {getCurrentUserId} from "@/lib/actions/watchlist.actions";
import {getPortfolio, getTradeHistory} from "@/lib/trading/account";
import AccountSummary from "@/components/trade/AccountSummary";
import OrderPanel from "@/components/trade/OrderPanel";
import PositionsTable from "@/components/trade/PositionsTable";
import TradeHistory from "@/components/trade/TradeHistory";
import ResetAccountButton from "@/components/trade/ResetAccountButton";

const scriptUrl = 'https://s3.tradingview.com/external-embedding/embed-widget-';

type TradePageProps = {
    searchParams: Promise<{symbol?: string}>;
};

const TradePage = async ({searchParams}: TradePageProps) => {
    const userId = await getCurrentUserId();
    if (!userId) redirect('/sign-in');

    const {symbol: raw} = await searchParams;
    const chartSymbol = (raw || 'NASDAQ:AAPL').toUpperCase();
    // Bare ticker (drop exchange prefix) seeds the order panel.
    const orderSymbol = chartSymbol.includes(':') ? chartSymbol.split(':').pop()! : chartSymbol;

    const [portfolio, trades] = await Promise.all([
        getPortfolio(userId),
        getTradeHistory(userId),
    ]);

    return (
        <div className="min-h-screen space-y-4">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-2">
                <div>
                    <h1 className="text-2xl font-semibold text-[#e2e2e8] mb-1" style={{fontFamily: 'var(--font-sora)'}}>
                        Trade Desk
                    </h1>
                    <p className="text-sm text-[#849495]" style={{fontFamily: 'var(--font-jetbrains)', letterSpacing: '0.02em'}}>
                        Paper trading · $100k virtual cash · live prices
                    </p>
                </div>
                <ResetAccountButton />
            </div>

            {/* Account summary */}
            <AccountSummary portfolio={portfolio} />

            {/* Symbol info */}
            <section className="glass-panel rounded-xl p-4 shimmer">
                <TradingViewWidget
                    scriptUrl={`${scriptUrl}symbol-info.js`}
                    config={SYMBOL_INFO_WIDGET_CONFIG(chartSymbol)}
                    height={170}
                />
            </section>

            {/* Chart + order entry */}
            <div className="grid gap-4 xl:grid-cols-3">
                <section className="xl:col-span-2 glass-panel rounded-xl p-4 shimmer">
                    <TradingViewWidget
                        title="Advanced Chart"
                        scriptUrl={`${scriptUrl}advanced-chart.js`}
                        config={TRADE_CHART_WIDGET_CONFIG(chartSymbol)}
                        height={560}
                    />
                </section>
                <div className="xl:col-span-1">
                    <OrderPanel defaultSymbol={orderSymbol} cash={portfolio.cash} />
                </div>
            </div>

            {/* Positions */}
            <section className="glass-panel rounded-xl p-5">
                <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-[#7df4ff] mb-4" style={{fontFamily: 'var(--font-jetbrains)'}}>
                    Open Positions
                </h2>
                <PositionsTable positions={portfolio.positions} />
            </section>

            {/* Trade history */}
            <section className="glass-panel rounded-xl p-5">
                <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-[#7df4ff] mb-4" style={{fontFamily: 'var(--font-jetbrains)'}}>
                    Trade History
                </h2>
                <TradeHistory trades={trades} />
            </section>
        </div>
    );
};

export default TradePage;
