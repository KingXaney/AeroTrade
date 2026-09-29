import {cn, formatPrice, getChangeColorClass} from "@/lib/utils";
import UnpricedNote from "@/components/trade/UnpricedNote";

const Stat = ({label, value, valueClass, hint}: {label: string; value: string; valueClass?: string; hint?: string}) => (
    <div className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-[0.1em] text-fg-muted"
              style={{fontFamily: 'var(--type-mono)'}}>
            {label}
        </span>
        <span className={cn('text-lg font-semibold text-fg', valueClass)}
              style={{fontFamily: 'var(--type-display)'}}>
            {value}
        </span>
        {hint && <span className="font-mono text-[10px] text-fg-muted">{hint}</span>}
    </div>
);

// Income is optional: the aggregated dashboard and a friend's page show the headline numbers
// only; the account's own page says where part of the return came from.
const AccountSummary = ({portfolio, income}: {portfolio: PortfolioSummary; income?: AccountIncomeSummary}) => {
    const earned = income ? income.interest + income.dividends : 0;
    const returnHint = income && earned > 0
        ? `incl. ${formatPrice(income.interest)} interest · ${formatPrice(income.dividends)} dividends`
        : undefined;
    const cashHint = income?.apy != null ? `earning ${(income.apy * 100).toFixed(2)}% APY` : undefined;

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
                    hint={returnHint}
                />
                <Stat label="Buying Power" value={formatPrice(portfolio.cash)} hint={cashHint} />
                <Stat label="Holdings Value" value={formatPrice(portfolio.holdingsValue)} />
            </div>
            {/* Net worth and total return both include the at-cost fallback, so the
                headline numbers are only as live as the note says. */}
            <UnpricedNote positions={portfolio.positions} className="mt-3" />
        </div>
    );
};

export default AccountSummary;
