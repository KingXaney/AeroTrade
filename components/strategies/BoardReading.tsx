import type {BoardReading as Reading} from "@/lib/strategies/learn/board-narration";

// "Read this board": the top row of a strategy's signal board read in plain words, then
// one line on how every other row reads (lib/strategies/learn/board-narration.ts). It is the lead of
// the board's single disclosure, above the definitions, so the panel still carries one
// disclosure of its kind. Presentational and client-safe.

const BoardReading = ({reading}: {reading: Reading}) => (
    <div data-board-reading={reading.symbol} className="space-y-1.5 max-w-3xl">
        <div data-board-row-reading className="space-y-1">
            {reading.lines.map((line, index) => (
                <p key={index} className="text-xs text-fg-soft leading-relaxed">{line}</p>
            ))}
        </div>
        <p data-board-key className="text-xs text-fg-muted leading-relaxed">{reading.key}</p>
    </div>
);

export default BoardReading;
