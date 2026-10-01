import type {ReactNode} from "react";
import {cn} from "@/lib/utils";
import {formatPct, formatSignedPrice, formatPrice, getChangeColorClass} from "@/lib/format";
import UnpricedNote from "@/components/trading/UnpricedNote";
import Term from "@/components/primitives/Term";
import WhatTheseMean from "@/components/learn/WhatTheseMean";
import type {AccountIncomeSummary} from '@/lib/income/types';
import type {PortfolioSummary} from '@/lib/trading/types';

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
        {hint && <span className="font-mono text-[10px] text-fg-muted">{hint}</span>}
    </div>
);

// Income is optional: the aggregated dashboard and a friend's page show the headline numbers
// only; the account's own page says where part of the return came from.
// `definitions` opts a page into the "What these mean" disclosure; the account-summary
// widget never passes it (its "Ask in chat" links stay off the dashboard, invariant 12).
const AccountSummary = ({portfolio, income, definitions = false}: {portfolio: PortfolioSummary; income?: AccountIncomeSummary; definitions?: boolean}) => {
    const earned = income ? income.interest + income.dividends : 0;
    const returnHint = income && earned > 0
        ? `incl. ${formatPrice(income.interest)} interest · ${formatPrice(income.dividends)} dividends`
        : undefined;
    const cashHint = income?.apy != null ? `earning ${(income.apy * 100).toFixed(2)}% APY` : undefined;

    const returnClass = getChangeColorClass(portfolio.totalReturnPct);

    return (
        <div className="glass-panel rounded-xl p-5 shimmer">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Stat label={<Term k="net-worth">Net Worth</Term>} value={formatPrice(portfolio.totalValue)} valueClass="text-brand" />
                <Stat
                    label={<Term k="total-return">Total Return</Term>}
                    value={`${formatSignedPrice(portfolio.totalReturnAbs)} (${formatPct(portfolio.totalReturnPct)})`}
                    valueClass={returnClass}
                    hint={returnHint}
                />
                <Stat label={<Term k="buying-power">Buying Power</Term>} value={formatPrice(portfolio.cash)} hint={cashHint} />
                <Stat label={<Term k="holdings-value">Holdings Value</Term>} value={formatPrice(portfolio.holdingsValue)} />
            </div>
            {/* Net worth and total return both include the at-cost fallback, so the
                headline numbers are only as live as the note says. */}
            <UnpricedNote positions={portfolio.positions} className="mt-3" />
            {definitions && (
                <WhatTheseMean keys={[
                    'net-worth', 'total-return', ...(returnHint ? ['income'] : []),
                    'buying-power', ...(cashHint ? ['apy'] : []), 'holdings-value',
                ]} />
            )}
        </div>
    );
};

export default AccountSummary;
