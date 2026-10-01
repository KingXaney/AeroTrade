import type {StrategyDefinition} from "@/lib/strategies/types";
import {decodeReason} from "@/lib/learn/reasons";
import {REPLAY_COPY} from "@/lib/learn/copy/replay";
import AskLink from "@/components/chat/AskLink";
import ReasonGloss from "@/components/learn/ReasonGloss";

// The "What the rule saw" disclosure for an order or a simulated fill that has no stored
// board row beside it (the latest decision's order list, the simulated trade log): the
// decoded reason and the one "Ask in chat" link. The trade log's own fills use
// DecisionReplay, which adds the board row on top. Nothing renders when the grammar does
// not know the reason — the raw reason is already on the row, and an empty disclosure
// is not information.

type Props = {
    reason: string;
    symbol: string;
    def: StrategyDefinition;
};

const ReasonDisclosure = ({reason, symbol, def}: Props) => {
    const {clauses} = decodeReason(reason, {def});
    if (clauses.length === 0) return null;
    return (
        <details data-decoded className="mt-1">
            <summary className="font-mono cursor-pointer list-none marker:content-none [&::-webkit-details-marker]:hidden text-[11px] text-brand hover:underline">
                {REPLAY_COPY.summary}
            </summary>
            <div className="mt-1.5 space-y-1.5">
                <ReasonGloss clauses={clauses} quoted={reason} />
                <AskLink input={{kind: 'reason', reason, symbol, strategy: def.name}} />
            </div>
        </details>
    );
};

export default ReasonDisclosure;
