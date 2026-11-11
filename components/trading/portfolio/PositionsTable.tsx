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
    // The dialog belongs to the account it was opened on: once the page is another account's,
    // it is gone (its position, quantity and price were the old account's).
    const [selling, setSelling] = useState<{accountId: string; position: EnrichedPosition} | null>(null);
    const sellTarget = selling?.accountId === accountId ? selling.position : null;
    const setSellTarget = (position: EnrichedPosition | null) => setSelling(position ? {accountId, position} : null);

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
                            className="control-type px-3 py-1.5 rounded text-xs transition-colors text-negative border border-negative/30 bg-negative/6"
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
