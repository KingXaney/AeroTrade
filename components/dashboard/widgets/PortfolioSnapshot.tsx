import {cn, formatPrice, getChangeColorClass} from "@/lib/utils";
import type {BestStrategy} from "@/lib/dashboard/select";
import UnpricedNote from "@/components/trade/UnpricedNote";

// Card body only: the widget shell provides the <Link> chrome and eyebrow label.
const PortfolioSnapshot = ({portfolio, best}: {portfolio: PortfolioSummary; best?: BestStrategy}) => {
    const sign = portfolio.totalReturnPct >= 0 ? '+' : '';
    return (
        <>
            <div className="text-2xl font-semibold text-fg" style={{fontFamily: 'var(--type-display)'}}>
                {formatPrice(portfolio.totalValue)}
            </div>
            <div className={cn('text-sm mt-1', getChangeColorClass(portfolio.totalReturnPct || undefined))}
                 style={{fontFamily: 'var(--type-mono)'}}>
                {sign}{portfolio.totalReturnPct.toFixed(2)}% <span className="text-fg-muted">total return</span>
            </div>
            <div className="text-xs text-fg-muted mt-3" style={{fontFamily: 'var(--type-mono)'}}>
                Cash {formatPrice(portfolio.cash)}
            </div>
            <UnpricedNote positions={portfolio.positions} className="mt-1" />
            {best && (
                <div className="text-xs mt-1" style={{fontFamily: 'var(--type-mono)'}}>
                    <span className="text-fg-muted">Best strategy: </span>
                    <span className="text-fg">{best.name}</span>{' '}
                    <span className={getChangeColorClass(best.totalReturnPct || undefined)}>
                        {best.totalReturnPct >= 0 ? '+' : ''}{best.totalReturnPct.toFixed(2)}%
                    </span>
                </div>
            )}
        </>
    );
};

export default PortfolioSnapshot;
