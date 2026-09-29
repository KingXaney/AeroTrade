import type {ReactNode} from "react";
import {cn, formatPrice, getChangeColorClass} from "@/lib/utils";
import Term from "@/components/primitives/Term";
import WhatTheseMean from "@/components/learn/WhatTheseMean";

const Stat = ({label, value, valueClass, hint}: {label: ReactNode; value: string; valueClass?: string; hint?: string}) => (
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

// `definitions` opts a page into the panel's "What these mean" disclosure. The dashboard
// widget that mounts these tiles never passes it: the disclosure carries "Ask in chat"
// links, which invariant 12 keeps off widgets. The Term titles stay either way.
const AnalyticsStats = ({analytics, tradesHint = 'Buys + sells, all time', definitions = false}: {analytics: AnalyticsStatFields; tradesHint?: string; definitions?: boolean}) => {
    const {maxDrawdownPct, winRatePct, wins, losses, realizedPnl, tradeCount, income} = analytics;
    const realizedClass = getChangeColorClass(realizedPnl || undefined);
    const earned = income ? income.interest + income.dividends : 0;

    return (
        <div className="glass-panel rounded-xl p-5">
            <div className={cn('grid grid-cols-2 gap-4', income ? 'md:grid-cols-5' : 'md:grid-cols-4')}>
            <Stat
                label={<Term k="max-drawdown">Max Drawdown</Term>}
                value={maxDrawdownPct === null ? '—' : `−${maxDrawdownPct.toFixed(2)}%`}
                valueClass={maxDrawdownPct !== null && maxDrawdownPct > 0 ? 'text-negative' : undefined}
                hint={maxDrawdownPct === null ? 'Needs 2+ days of history' : 'Largest peak-to-trough dip'}
            />
            <Stat
                label={<Term k="win-rate">Win Rate</Term>}
                value={winRatePct === null ? '—' : `${winRatePct.toFixed(0)}%`}
                valueClass={winRatePct !== null ? getChangeColorClass(winRatePct - 50 || undefined) : undefined}
                hint={winRatePct === null ? 'No closed trades yet' : `${wins}W / ${losses}L`}
            />
            <Stat
                label={<Term k="realized-pnl">Realized P&L</Term>}
                value={`${realizedPnl >= 0 ? '+' : ''}${formatPrice(realizedPnl)}`}
                valueClass={realizedClass}
                hint="From closed positions"
            />
            {/* Without it, realized + unrealized P&L no longer add up to total return and the
                gap has no explanation on the page. */}
            {income && (
                <Stat
                    label={<Term k="income">Income</Term>}
                    value={`+${formatPrice(earned)}`}
                    valueClass={earned > 0 ? 'text-positive' : undefined}
                    hint={income.through === null ? 'First credit tonight' : 'Interest + dividends'}
                />
            )}
            <Stat
                label={<Term k="trades">Trades</Term>}
                value={String(tradeCount)}
                hint={tradesHint}
            />
            </div>
            {definitions && <WhatTheseMean keys={['max-drawdown', 'win-rate', 'realized-pnl', ...(income ? ['income'] : []), 'trades']} />}
        </div>
    );
};

export default AnalyticsStats;
