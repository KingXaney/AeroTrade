import {formatPct, formatSignedPrice, formatPrice, getChangeColorClass} from "@/lib/format";
import UnpricedNote from "@/components/trading/UnpricedNote";
import StatTile from "@/components/primitives/StatTile";
import Term from "@/components/primitives/Term";
import WhatTheseMean from "@/components/learn/WhatTheseMean";
import type {AccountIncomeSummary} from '@/lib/income/types';
import type {PortfolioSummary} from '@/lib/trading/types';
import Panel from '@/components/primitives/Panel';

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
        <Panel as="div" className="shimmer">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatTile label={<Term k="net-worth">Net Worth</Term>} value={formatPrice(portfolio.totalValue)} valueClass="text-brand" />
                <StatTile
                    label={<Term k="total-return">Total Return</Term>}
                    value={`${formatSignedPrice(portfolio.totalReturnAbs)} (${formatPct(portfolio.totalReturnPct)})`}
                    valueClass={returnClass}
                    hint={returnHint}
                />
                <StatTile label={<Term k="buying-power">Buying Power</Term>} value={formatPrice(portfolio.cash)} hint={cashHint} />
                <StatTile label={<Term k="holdings-value">Holdings Value</Term>} value={formatPrice(portfolio.holdingsValue)} />
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
        </Panel>
    );
};

export default AccountSummary;
