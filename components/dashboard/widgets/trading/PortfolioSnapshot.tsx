import {cn} from "@/lib/utils";
import {formatPct, formatPrice, getChangeColorClass} from "@/lib/format";
import type {BestAccount} from "@/lib/dashboard/select";
import UnpricedNote from "@/components/trading/UnpricedNote";
import type {PortfolioSummary} from '@/lib/trading/types';

// Card body only: the widget shell provides the <Link> chrome and eyebrow label.
const PortfolioSnapshot = ({portfolio, best}: {portfolio: PortfolioSummary; best?: BestAccount}) => {
    return (
        <>
            <div className="text-2xl font-semibold text-fg font-heading">
                {formatPrice(portfolio.totalValue)}
            </div>
            <div className={cn('font-mono text-sm mt-1', getChangeColorClass(portfolio.totalReturnPct))}>
                {formatPct(portfolio.totalReturnPct)} <span className="text-fg-muted">total return</span>
            </div>
            <div className="text-xs text-fg-muted mt-3 font-mono">
                Cash {formatPrice(portfolio.cash)}
            </div>
            <UnpricedNote positions={portfolio.positions} className="mt-1" />
            {best && (
                <div className="text-xs mt-1 font-mono">
                    <span className="text-fg-muted">Best account: </span>
                    <span className="text-fg">{best.name}</span>{' '}
                    <span className={getChangeColorClass(best.totalReturnPct)}>
                        {formatPct(best.totalReturnPct)}
                    </span>
                </div>
            )}
        </>
    );
};

export default PortfolioSnapshot;
