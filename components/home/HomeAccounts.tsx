import Link from "next/link";
import {cn} from "@/lib/utils";
import {formatPct, formatPrice, getChangeColorClass} from "@/lib/format";
import {describeUnpriced} from "@/lib/trading/analytics";
import {HOME_COPY} from "@/lib/learn/copy/home";
import MicroLabel from "@/components/primitives/MicroLabel";
import {rowCard} from "@/components/primitives/RowCard";
import type {HomeAccounts as Accounts} from "@/lib/home/view";

// Home's accounts: one total, then a row per account that opens it on /portfolio. The caveat for
// holdings valued at cost is stated once, under the total it qualifies (invariant 8).
const HomeAccounts = ({accounts}: {accounts: Accounts}) => {
    const many = accounts.rows.length > 1;
    const unpriced = describeUnpriced(accounts.unpriced, accounts.rows.reduce((sum, r) => sum + r.holdings, 0));
    return (
        <div>
            <p className="font-heading text-3xl font-semibold text-fg" data-home-total>{formatPrice(accounts.totalValue)}</p>
            <p className="mt-1 font-mono text-sm">
                <span className={getChangeColorClass(accounts.totalReturnPct)}>{formatPct(accounts.totalReturnPct)}</span>
                <span className="text-xs text-fg-muted"> {HOME_COPY.totalReturn}</span>
                {many && <MicroLabel className="ml-2">{HOME_COPY.accountsTotal(accounts.rows.length)}</MicroLabel>}
            </p>
            {unpriced && <p className="mt-1 text-xs text-warning">{unpriced}</p>}

            <ul className="mt-4 space-y-2">
                {accounts.rows.map((row) => (
                    <li key={row.id}>
                        <Link href={`/portfolio?account=${row.id}`}
                              className={rowCard({interactive: true, className: 'flex items-center justify-between gap-3'})}>
                            <span className="min-w-0">
                                <span className="block truncate font-heading text-sm font-semibold text-fg">{row.name}</span>
                                <span className="block text-xs text-fg-muted">
                                    {HOME_COPY.holdings(row.holdings)} · {HOME_COPY.cash} {formatPrice(row.cash)}
                                </span>
                            </span>
                            <span className="shrink-0 text-right font-mono">
                                <span className="block text-sm text-fg">{formatPrice(row.totalValue)}</span>
                                <span className={cn('block text-xs', getChangeColorClass(row.totalReturnPct))}>{formatPct(row.totalReturnPct)}</span>
                            </span>
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default HomeAccounts;
