import {cn} from "@/lib/utils";
import {formatPct, formatPrice, getChangeColorClass} from "@/lib/format";
import type {BestStrategy} from "@/lib/dashboard/select";
import UnpricedNote from "@/components/trading/UnpricedNote";
import type {PortfolioSummary} from '@/lib/trading/types';

// Card body only: the widget shell provides the <Link> chrome and eyebrow label.
const PortfolioSnapshot = ({portfolio, best}: {portfolio: PortfolioSummary; best?: BestStrategy}) => {
    return (
        <>
            <div className="text-2xl font-semibold text-fg" style={{fontFamily: 'var(--type-display)'}}>
                {formatPrice(portfolio.totalValue)}
            </div>
            <div className={cn('text-sm mt-1', getChangeColorClass(portfolio.totalReturnPct))}
                 style={{fontFamily: 'var(--type-mono)'}}>
                {formatPct(portfolio.totalReturnPct)} <span className="text-fg-muted">total return</span>
            </div>
            <div className="text-xs text-fg-muted mt-3" style={{fontFamily: 'var(--type-mono)'}}>
                Cash {formatPrice(portfolio.cash)}
            </div>
            <UnpricedNote positions={portfolio.positions} className="mt-1" />
            {best && (
                <div className="text-xs mt-1" style={{fontFamily: 'var(--type-mono)'}}>
                    <span className="text-fg-muted">Best strategy: </span>
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
