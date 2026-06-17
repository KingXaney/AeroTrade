import {redirect} from "next/navigation";
import Link from "next/link";
import {getCurrentUserId} from "@/lib/actions/watchlist.actions";
import {getPortfolio} from "@/lib/trading/account";
import AccountSummary from "@/components/trade/AccountSummary";
import PositionsTable from "@/components/trade/PositionsTable";

const PortfolioPage = async () => {
    const userId = await getCurrentUserId();
    if (!userId) redirect('/sign-in');

    const portfolio = await getPortfolio(userId);
    const count = portfolio.positions.length;

    return (
        <div className="min-h-screen space-y-4">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-2">
                <div>
                    <h1 className="text-2xl font-semibold text-[#e2e2e8] mb-1" style={{fontFamily: 'var(--font-sora)'}}>
                        Portfolio
                    </h1>
                    <p className="text-sm text-[#849495]" style={{fontFamily: 'var(--font-jetbrains)', letterSpacing: '0.02em'}}>
                        {count === 0 ? 'No open positions yet' : `${count} ${count === 1 ? 'holding' : 'holdings'} · live valuation`}
                    </p>
                </div>
                <Link
                    href="/trade"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-[0.1em] transition-all active:scale-[0.98]"
                    style={{fontFamily: 'var(--font-jetbrains)', backgroundColor: '#7df4ff', color: '#002022', boxShadow: '0 0 15px rgba(125,244,255,0.3)'}}
                >
                    <span className="material-symbols-outlined text-base">candlestick_chart</span>
                    Trade Desk
                </Link>
            </div>

            {/* Account summary */}
            <AccountSummary portfolio={portfolio} />

            {/* Holdings */}
            <section className="glass-panel rounded-xl p-5">
                <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-[#7df4ff] mb-4" style={{fontFamily: 'var(--font-jetbrains)'}}>
                    Holdings
                </h2>
                <PositionsTable positions={portfolio.positions} />
            </section>
        </div>
    );
};

export default PortfolioPage;
