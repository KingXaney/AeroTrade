'use client';

import {useState} from "react";
import {cn} from "@/lib/utils";
import type {RowState} from "@/lib/strategies/types";
import type {ReasonClause} from "@/lib/learn/reasons";
import {STATE_LABEL, STATE_TONE} from "@/lib/strategies/views";
import {ASKABLE_STATES, VERDICT_QUIZ_COPY} from "@/lib/learn/copy/verdict";
import Badge from "@/components/primitives/Badge";
import ReasonGloss from "@/components/learn/ReasonGloss";

// Guess the Verdict: today's real board rows with the verdict hidden. The reader calls
// each row, then the stored verdict and the rule's own reason are revealed, the reason
// decoded clause by clause beneath it (decoded on the server; plain data here). While the
// disclosure is open, the page hides the board's verdict column with CSS (:has), so the
// server-rendered board needs no state of its own. Nothing is persisted.

export type QuizRow = {
    symbol: string;
    cells: {label: string; value: string}[];
    answer: RowState;
    explanation: string;
    // decodeReason(explanation).clauses — empty when the explanation is not a rule string.
    gloss: readonly ReasonClause[];
};

const VerdictQuiz = ({rows}: {rows: QuizRow[]}) => {
    const [guesses, setGuesses] = useState<Record<string, RowState>>({});
    const [revealed, setRevealed] = useState(false);
    const guessed = rows.filter((row) => guesses[row.symbol] !== undefined).length;
    const matched = rows.filter((row) => guesses[row.symbol] === row.answer).length;

    return (
        <details id="verdict-quiz" data-verdict-quiz className="group mt-3">
            <summary className="font-mono cursor-pointer list-none marker:content-none [&::-webkit-details-marker]:hidden text-[11px] text-brand hover:underline inline-flex items-center gap-1">
                <span className="material-symbols-outlined text-sm transition-transform group-open:rotate-90" aria-hidden="true">chevron_right</span>
                {VERDICT_QUIZ_COPY.summary}
            </summary>
            <p className="mt-2 text-xs text-fg-muted">{VERDICT_QUIZ_COPY.intro}</p>
            <ul className="mt-2 space-y-2">
                {rows.map((row) => {
                    const guess = guesses[row.symbol];
                    const outcome = guess === undefined ? VERDICT_QUIZ_COPY.unanswered : guess === row.answer ? VERDICT_QUIZ_COPY.matched : VERDICT_QUIZ_COPY.missed;
                    return (
                        <li key={row.symbol} data-quiz-row={row.symbol}
                            className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 py-2 rounded-lg border bg-surface-2/40 border-line-strong/20">
                            <span className="font-mono text-sm font-bold text-fg">{row.symbol}</span>
                            {row.cells.map((cell) => (
                                <span key={cell.label} className="text-xs">
                                    <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-fg-muted">{cell.label} </span>
                                    <span className="font-mono text-fg-soft">{cell.value}</span>
                                </span>
                            ))}
                            <span className="flex items-center gap-1 ml-auto" role="group" aria-label={`Your call for ${row.symbol}`}>
                                {ASKABLE_STATES.map((state) => (
                                    <button
                                        key={state}
                                        type="button"
                                        aria-pressed={guess === state}
                                        disabled={revealed}
                                        onClick={() => setGuesses((g) => ({...g, [row.symbol]: state}))}
                                        className={cn('rounded-[var(--control-radius)] transition-opacity', guess === state ? 'outline outline-1 outline-brand' : 'opacity-60 hover:opacity-100')}
                                    >
                                        <Badge tone={STATE_TONE[state]} variant="outline">{STATE_LABEL[state]}</Badge>
                                    </button>
                                ))}
                            </span>
                            {revealed && (
                                <span className="basis-full flex flex-wrap items-center gap-2 text-[11px] text-fg-muted" data-quiz-answer>
                                    <Badge tone={STATE_TONE[row.answer]} variant="solid">{STATE_LABEL[row.answer]}</Badge>
                                    <span className={cn(guess === row.answer ? 'text-positive' : guess !== undefined ? 'text-negative' : undefined)}>{outcome}</span>
                                    <span>· {row.explanation}</span>
                                </span>
                            )}
                            {revealed && <ReasonGloss clauses={row.gloss} quoted={row.explanation} className="basis-full pl-1" />}
                        </li>
                    );
                })}
            </ul>
            <div className="mt-2 flex items-center gap-3">
                {revealed
                    ? <span className="font-mono text-[11px] text-fg-muted" data-quiz-tally>{VERDICT_QUIZ_COPY.tally(matched, guessed)}</span>
                    : (
                        <button
                            id="verdict-reveal"
                            type="button"
                            disabled={guessed === 0}
                            onClick={() => setRevealed(true)}
                            className="font-mono text-[11px] text-brand hover:underline disabled:opacity-40 disabled:no-underline"
                        >
                            {VERDICT_QUIZ_COPY.reveal}
                        </button>
                    )}
            </div>
        </details>
    );
};

export default VerdictQuiz;
