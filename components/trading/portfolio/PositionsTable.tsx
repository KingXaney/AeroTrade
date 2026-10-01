'use client';

import {useState} from "react";
import Link from "next/link";
import SellPositionDialog from "@/components/trading/desk/SellPositionDialog";
import type {Lot} from "@/lib/trading/lots";
import TradeLink from "@/components/trading/TradeLink";
import HoldingsTable from "@/components/trading/portfolio/HoldingsTable";
import {HOLDINGS_COPY} from "@/lib/learn/copy/portfolio";
import type {EnrichedPosition} from '@/lib/trading/types';

// /portfolio's Holdings panel (its only caller; /trade shows OpenPositionsStrip): the shared
// HoldingsTable with an Action column, whose Sell opens a dialog where the user picks how
// many shares to sell. /portfolio has no order panel, so the empty state links to the Trade Desk.
// lotNotes: the learner's notes on the shares still held, by symbol (pages only).
const PositionsTable = ({positions, accountId, lotNotes}: {positions: EnrichedPosition[]; accountId: string; lotNotes?: Readonly<Record<string, readonly Lot[]>>}) => {
    const [sellTarget, setSellTarget] = useState<EnrichedPosition | null>(null);

    if (positions.length === 0) {
        return (
            <p className="text-sm text-fg-muted p-4" data-testid="positions-empty">
                {HOLDINGS_COPY.empty}{' '}
                <Link href="/trade" className="text-brand hover:underline">{HOLDINGS_COPY.toTradeDesk}</Link>
            </p>
        );
    }

    return (
        <>
            <HoldingsTable
                positions={positions}
                actions={(p) => (
                    <>
                        <TradeLink symbol={p.symbol} />
                        <button
                            type="button"
                            onClick={() => setSellTarget(p)}
                            className="px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-colors"
                            style={{color: 'var(--negative)', border: '1px solid color-mix(in srgb, var(--negative) 30%, transparent)', backgroundColor: 'color-mix(in srgb, var(--negative) 6%, transparent)', fontFamily: 'var(--type-mono)'}}
                        >
                            Sell
                        </button>
                    </>
                )}
            />
            {sellTarget && <SellPositionDialog position={sellTarget} accountId={accountId} notes={lotNotes?.[sellTarget.symbol]} onClose={() => setSellTarget(null)} />}
        </>
    );
};

export default PositionsTable;
