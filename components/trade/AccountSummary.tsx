import {cn, formatPrice, getChangeColorClass} from "@/lib/utils";

const Stat = ({label, value, valueClass}: {label: string; value: string; valueClass?: string}) => (
    <div className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-[0.1em] text-[#849495]"
              style={{fontFamily: 'var(--font-jetbrains)'}}>
            {label}
        </span>
        <span className={cn('text-lg font-semibold text-[#e2e2e8]', valueClass)}
              style={{fontFamily: 'var(--font-sora)'}}>
            {value}
        </span>
    </div>
);

const AccountSummary = ({portfolio}: {portfolio: PortfolioSummary}) => {
    const returnClass = getChangeColorClass(portfolio.totalReturnPct || undefined);
    const sign = portfolio.totalReturnAbs >= 0 ? '+' : '';

    return (
        <div className="glass-panel rounded-xl p-5 grid grid-cols-2 md:grid-cols-4 gap-4 shimmer">
            <Stat label="Net Worth" value={formatPrice(portfolio.totalValue)} valueClass="text-[#7df4ff]" />
            <Stat
                label="Total Return"
                value={`${sign}${formatPrice(portfolio.totalReturnAbs)} (${sign}${portfolio.totalReturnPct.toFixed(2)}%)`}
                valueClass={returnClass}
            />
            <Stat label="Buying Power" value={formatPrice(portfolio.cash)} />
            <Stat label="Holdings Value" value={formatPrice(portfolio.holdingsValue)} />
        </div>
    );
};

export default AccountSummary;
