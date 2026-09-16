import {cn, formatPrice, getChangeColorClass} from "@/lib/utils";
import UnpricedNote from "@/components/trade/UnpricedNote";

const Stat = ({label, value, valueClass}: {label: string; value: string; valueClass?: string}) => (
    <div className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-[0.1em] text-fg-muted"
              style={{fontFamily: 'var(--type-mono)'}}>
            {label}
        </span>
        <span className={cn('text-lg font-semibold text-fg', valueClass)}
              style={{fontFamily: 'var(--type-display)'}}>
            {value}
        </span>
    </div>
);

const AccountSummary = ({portfolio}: {portfolio: PortfolioSummary}) => {
    const returnClass = getChangeColorClass(portfolio.totalReturnPct || undefined);
    const sign = portfolio.totalReturnAbs >= 0 ? '+' : '';

    return (
        <div className="glass-panel rounded-xl p-5 shimmer">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Stat label="Net Worth" value={formatPrice(portfolio.totalValue)} valueClass="text-brand" />
                <Stat
                    label="Total Return"
                    value={`${sign}${formatPrice(portfolio.totalReturnAbs)} (${sign}${portfolio.totalReturnPct.toFixed(2)}%)`}
                    valueClass={returnClass}
                />
                <Stat label="Buying Power" value={formatPrice(portfolio.cash)} />
                <Stat label="Holdings Value" value={formatPrice(portfolio.holdingsValue)} />
            </div>
            {/* Net worth and total return both include the at-cost fallback, so the
                headline numbers are only as live as the note says. */}
            <UnpricedNote positions={portfolio.positions} className="mt-3" />
        </div>
    );
};

export default AccountSummary;
