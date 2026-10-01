import type {ReactNode} from "react";
import {cn} from "@/lib/utils";
import {formatDrawdown, formatPrice, formatSignedPrice, roundPct, getChangeColorClass} from "@/lib/format";
import Term from "@/components/primitives/Term";
import WhatTheseMean from "@/components/learn/WhatTheseMean";
import {DRAWDOWN_COPY, drawdownLine} from "@/lib/learn/copy/portfolio";
import type {AccountAnalytics} from '@/lib/trading/types';

// The one analytics tile: exported so the risk lens (components/trading/learn/RiskLens.tsx) is built
// from it rather than from a third copy.
export const Stat = ({label, value, valueClass, hint}: {label: ReactNode; value: string; valueClass?: string; hint?: string}) => (
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
// Takes only the six stat fields so a simulated record can use the same tiles. The dated
// drawdown is optional: without it (a caller built from older data) the hint stays undated.
export type AnalyticsStatFields = Pick<AccountAnalytics, 'maxDrawdownPct' | 'winRatePct' | 'wins' | 'losses' | 'realizedPnl' | 'tradeCount'>
    & Partial<Pick<AccountAnalytics, 'income' | 'drawdown' | 'benchmarkOverDrawdownPct'>>;

// `definitions` opts a page into the panel's "What these mean" disclosure. The dashboard
// widget that mounts these tiles never passes it: the disclosure carries "Ask in chat"
// links, which invariant 12 keeps off widgets. The Term titles stay either way.
const AnalyticsStats = ({analytics, definitions = false}: {analytics: AnalyticsStatFields; definitions?: boolean}) => {
    const {maxDrawdownPct, winRatePct, wins, losses, realizedPnl, tradeCount, income, drawdown, benchmarkOverDrawdownPct} = analytics;
    const realizedClass = getChangeColorClass(realizedPnl);
    const earned = income ? income.interest + income.dividends : 0;
    const drawdownHint = drawdownLine({maxDrawdownPct, drawdown, benchmarkOverDrawdownPct});
    // A dated hint says what the climb back takes, so its definition joins the disclosure.
    const dated = drawdownHint !== DRAWDOWN_COPY.undated && drawdownHint !== DRAWDOWN_COPY.needsHistory;

    return (
        <div className="glass-panel rounded-xl p-5">
            <div className={cn('grid grid-cols-2 gap-4', income ? 'md:grid-cols-5' : 'md:grid-cols-4')}>
            <Stat
                label={<Term k="max-drawdown">Max Drawdown</Term>}
                value={formatDrawdown(maxDrawdownPct)}
                valueClass={maxDrawdownPct !== null && roundPct(maxDrawdownPct) > 0 ? 'text-negative' : undefined}
                hint={drawdownHint}
            />
            <Stat
                label={<Term k="win-rate">Win Rate</Term>}
                value={winRatePct === null ? '—' : `${winRatePct.toFixed(0)}%`}
                valueClass={winRatePct !== null ? getChangeColorClass(winRatePct - 50) : undefined}
                hint={winRatePct === null ? 'No closed trades yet' : `${wins}W / ${losses}L`}
            />
            <Stat
                label={<Term k="realized-pnl">Realized P&L</Term>}
                value={formatSignedPrice(realizedPnl)}
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
                hint="Buys + sells, all time"
            />
            </div>
            {definitions && <WhatTheseMean keys={['max-drawdown', ...(dated ? ['recovery'] : []), 'win-rate', 'realized-pnl', ...(income ? ['income'] : []), 'trades']} />}
        </div>
    );
};

export default AnalyticsStats;
