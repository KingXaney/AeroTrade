import {cn, formatPrice, getChangeColorClass} from "@/lib/utils";

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
        {hint && (
            <span className="text-[10px] text-fg-muted" style={{fontFamily: 'var(--type-mono)'}}>
                {hint}
            </span>
        )}
    </div>
);

// Strategy analytics tiles — mirrors the AccountSummary visual pattern.
// Win rate and drawdown show em-dashes until there is enough history to
// compute them honestly (no closed trades / fewer than two snapshot days).
// Takes only the six stat fields so a simulated record can use the same tiles.
export type AnalyticsStatFields = Pick<AccountAnalytics, 'maxDrawdownPct' | 'winRatePct' | 'wins' | 'losses' | 'realizedPnl' | 'tradeCount'>
    & Partial<Pick<AccountAnalytics, 'income'>>;

const AnalyticsStats = ({analytics, tradesHint = 'Buys + sells, all time'}: {analytics: AnalyticsStatFields; tradesHint?: string}) => {
    const {maxDrawdownPct, winRatePct, wins, losses, realizedPnl, tradeCount, income} = analytics;
    const realizedClass = getChangeColorClass(realizedPnl || undefined);
    const earned = income ? income.interest + income.dividends : 0;

    return (
        <div className={cn('glass-panel rounded-xl p-5 grid grid-cols-2 gap-4', income ? 'md:grid-cols-5' : 'md:grid-cols-4')}>
            <Stat
                label="Max Drawdown"
                value={maxDrawdownPct === null ? '—' : `−${maxDrawdownPct.toFixed(2)}%`}
                valueClass={maxDrawdownPct !== null && maxDrawdownPct > 0 ? 'text-negative' : undefined}
                hint={maxDrawdownPct === null ? 'Needs 2+ days of history' : 'Largest peak-to-trough dip'}
            />
            <Stat
                label="Win Rate"
                value={winRatePct === null ? '—' : `${winRatePct.toFixed(0)}%`}
                valueClass={winRatePct !== null ? getChangeColorClass(winRatePct - 50 || undefined) : undefined}
                hint={winRatePct === null ? 'No closed trades yet' : `${wins}W / ${losses}L`}
            />
            <Stat
                label="Realized P&L"
                value={`${realizedPnl >= 0 ? '+' : ''}${formatPrice(realizedPnl)}`}
                valueClass={realizedClass}
                hint="From closed positions"
            />
            {/* Without it, realized + unrealized P&L no longer add up to total return and the
                gap has no explanation on the page. */}
            {income && (
                <Stat
                    label="Income"
                    value={`+${formatPrice(earned)}`}
                    valueClass={earned > 0 ? 'text-positive' : undefined}
                    hint={income.through === null ? 'First credit tonight' : 'Interest + dividends'}
                />
            )}
            <Stat
                label="Trades"
                value={String(tradeCount)}
                hint={tradesHint}
            />
        </div>
    );
};

export default AnalyticsStats;
