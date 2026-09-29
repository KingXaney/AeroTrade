import {concentration} from "@/lib/trading/analytics";
import {dailySwingDollars} from "@/lib/trading/risk";
import {RISK_COPY} from "@/lib/learn/copy/portfolio";
import {Stat} from "@/components/analytics/AnalyticsStats";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";
import Term from "@/components/primitives/Term";
import WhatTheseMean from "@/components/learn/WhatTheseMean";

// Two measurements of how exposed the account is, from numbers the page already has: how far
// its value moves on an ordinary day (from its own daily closes), and how much of it sits in one
// holding. The caption sets that share beside the AI Navigator's own rails, by mechanism. No
// drawdown tile: the dated drawdown lives in the Max Drawdown hint and the chart's band.
// Server component; nothing here is interactive.

// snapshotThrough: the last stored snapshot's date (AccountAnalytics.snapshotThrough), so the
// swing counts closes and not the live point the chart appends after them.
const RiskLens = ({series, snapshotThrough, portfolio}: {series: readonly PerfPoint[]; snapshotThrough: string | null; portfolio: PortfolioSummary}) => {
    const swing = dailySwingDollars(series, portfolio.totalValue, snapshotThrough);
    const {largest} = concentration(portfolio.positions, portfolio.cash, portfolio.totalValue);

    return (
        <Panel id="risk-lens" aria-labelledby="risk-lens-heading">
            <SectionHeading id="risk-lens-heading" spacing="sm">{RISK_COPY.heading}</SectionHeading>
            <div className="grid grid-cols-2 gap-4">
                <div data-testid="risk-swing">
                    <Stat
                        label={<Term k="daily-swing">{RISK_COPY.swingLabel}</Term>}
                        value={swing ? RISK_COPY.swingValue(swing.dollars) : '—'}
                        hint={swing ? RISK_COPY.swingHint(swing.pct) : RISK_COPY.swingNeedsHistory}
                    />
                </div>
                <div data-testid="risk-largest">
                    <Stat
                        label={<Term k="concentration">{RISK_COPY.largestLabel}</Term>}
                        value={largest ? RISK_COPY.largestValue(largest.weight) : '—'}
                        hint={largest ? RISK_COPY.largestHint(largest.symbol, largest.marketValue, largest.priceStale) : RISK_COPY.allCash}
                    />
                </div>
            </div>
            {largest && (
                <p className="mt-3 font-mono text-[11px] text-fg-muted" data-testid="risk-caption">
                    {RISK_COPY.caption(largest.symbol, largest.weight)}
                </p>
            )}
            <WhatTheseMean keys={['daily-swing', 'concentration', ...(largest ? ['position-cap', 'cash-floor'] : [])]} />
        </Panel>
    );
};

export default RiskLens;
