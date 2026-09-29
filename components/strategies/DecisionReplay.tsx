import type {SignalRow, StrategyDefinition} from "@/lib/strategies/types";
import {visibleSignalColumns, type RunOrderView} from "@/lib/strategies/views";
import {decodeReason} from "@/lib/learn/reasons";
import {SignalRowLine} from "@/components/strategies/SignalBoard";
import {REPLAY_COPY} from "@/lib/learn/copy/replay";
import AskLink from "@/components/chat/AskLink";
import ReasonGloss from "@/components/learn/ReasonGloss";

// The one disclosure an automated fill gets: the stored board row the rule looked at
// that morning, rendered with the catalog's own columns, the planned order's reason
// beneath it, that reason decoded clause by clause, and "Ask in chat" at the foot. When
// the row is gone (expired record, pre-record fill) the caption says so, and the reason
// the fill itself stores — already printed on its trade row — is still decoded.

type Props = {
    def: StrategyDefinition;
    row: SignalRow | null;
    order: RunOrderView | null;
    caption: string;
    // replayReason: the planned order's reason, else the fill's own; null when neither has one.
    reason: string | null;
    symbol: string;
};

const DecisionReplay = ({def, row, order, caption, reason, symbol}: Props) => (
    <div className="mt-2 space-y-1.5" data-replay-body>
        <p className="font-mono text-[11px] text-fg-muted">{caption}</p>
        {row && <SignalRowLine columns={visibleSignalColumns(def.signalColumns, [row])} row={row} />}
        {order && (
            <p className="text-[11px] text-fg-muted leading-snug">
                <span className="font-mono uppercase tracking-[0.1em] text-[10px]">{REPLAY_COPY.plannedOrder} · </span>
                {order.reason}
            </p>
        )}
        {reason && <ReasonGloss clauses={decodeReason(reason, {def}).clauses} quoted={reason} />}
        {reason && <AskLink input={{kind: 'reason', reason, symbol, strategy: def.name}} />}
    </div>
);

export default DecisionReplay;
