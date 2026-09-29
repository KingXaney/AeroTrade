import type {BoardReading as Reading} from "@/lib/learn/board-narration";
import {BOARD_COPY} from "@/lib/learn/copy/board";

// "Read this board": the top row of a strategy's signal board read in plain words, then
// one line on how every other row reads (lib/learn/board-narration.ts). It is the lead of
// the board's single disclosure, above the definitions, so the panel still carries one
// disclosure of its kind. Presentational and client-safe.
//
// The reading states the top row's verdict, which Guess the Verdict asks the reader to
// call, so the strategy page hides `data-board-row-reading` and shows
// `data-board-reading-paused` in its place while the quiz is open (CSS :has on
// #strategy-signals, the same switch that hides the board's verdict column). The line on
// how every row reads stays: it is the rule, not an answer.

const BoardReading = ({reading}: {reading: Reading}) => (
    <div data-board-reading={reading.symbol} className="space-y-1.5 max-w-3xl">
        <div data-board-row-reading className="space-y-1">
            {reading.lines.map((line, index) => (
                <p key={index} className="text-xs text-fg-soft leading-relaxed">{line}</p>
            ))}
        </div>
        <p data-board-reading-paused className="hidden text-xs text-fg-muted leading-relaxed">{BOARD_COPY.paused}</p>
        <p data-board-key className="text-xs text-fg-muted leading-relaxed">{reading.key}</p>
    </div>
);

export default BoardReading;
