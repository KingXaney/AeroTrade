'use client';

import {useId, useState, useTransition, type FormEvent} from "react";
import {toast} from "sonner";
import {cn} from "@/lib/utils";
import {UNREACHABLE_MESSAGE} from "@/lib/action-toast";
import {formatEasternTimestamp} from "@/lib/format";
import {revealPuzzleSolution, submitPuzzleAnswer, takePuzzleHint, type PuzzleActionResult} from "@/lib/actions/games.actions";
import type {AnswerCheck} from "@/lib/games/answer";
import type {Streak} from "@/lib/games/streak";
import type {PuzzleProgress, PuzzleView} from "@/lib/games/types";
import {PUZZLE_COPY, STREAK_COPY} from "@/lib/learn/copy/games";
import ActionButton from "@/components/primitives/ActionButton";
import MicroLabel from "@/components/primitives/MicroLabel";
import RowCard from "@/components/primitives/RowCard";
import TextField from "@/components/primitives/TextField";

type Props = {
    puzzle: PuzzleView;
    // Today's puzzle: a solve counts toward the streak.
    daily: boolean;
    initial: PuzzleProgress;
};

const FEEDBACK: Record<Exclude<AnswerCheck, 'correct'>, string> = {
    close: PUZZLE_COPY.close,
    wrong: PUZZLE_COPY.wrong,
    unreadable: PUZZLE_COPY.unreadable,
};

// One puzzle, answered here and checked on the server: the page holds the prompt and the hints
// taken so far, never the answer, until the puzzle is solved or its solution is shown. The
// state starts from the server's read and moves only on the actions' replies.
const PuzzleSolver = ({puzzle, daily, initial}: Props) => {
    const [progress, setProgress] = useState(initial);
    const [answer, setAnswer] = useState('');
    const [feedback, setFeedback] = useState<AnswerCheck | null>(null);
    const [streak, setStreak] = useState<Streak | null>(null);
    const [confirming, setConfirming] = useState(false);
    const [pending, startTransition] = useTransition();
    const inputId = useId();
    const closed = progress.status === 'solved' || progress.status === 'revealed';
    const hintsLeft = puzzle.hintCount - progress.hints.length;

    const run = (action: () => Promise<PuzzleActionResult>, after?: (result: Extract<PuzzleActionResult, {success: true}>) => void) =>
        startTransition(async () => {
            const result = await action().catch((): PuzzleActionResult => ({success: false, message: UNREACHABLE_MESSAGE}));
            if (!result.success) {
                toast.error(result.message);
                return;
            }
            setProgress(result.progress);
            if (result.streak) setStreak(result.streak);
            after?.(result);
        });

    const submit = (event: FormEvent) => {
        event.preventDefault();
        if (!answer.trim() || pending) return;
        run(() => submitPuzzleAnswer({puzzleId: puzzle.id, daily, answer}), (result) => {
            setFeedback(result.check ?? null);
            if (result.check === 'correct') setAnswer('');
        });
    };

    const feedbackText = feedback && feedback !== 'correct'
        ? (feedback === 'close' && puzzle.estimate ? PUZZLE_COPY.closeEstimate : FEEDBACK[feedback])
        : null;

    return (
        <div className="space-y-5" data-puzzle={puzzle.id} data-puzzle-status={progress.status ?? 'new'}>
            <div className="space-y-3">
                {puzzle.prompt.map((sentence) => (
                    <p key={sentence} className="text-base leading-relaxed text-fg">{sentence}</p>
                ))}
            </div>

            {!closed && (
                <form onSubmit={submit} className="space-y-2" data-puzzle-form>
                    <label htmlFor={inputId} className="block text-xs font-semibold text-fg-soft">{PUZZLE_COPY.answerLabel}</label>
                    <div className="flex flex-wrap items-center gap-2">
                        <TextField
                            id={inputId}
                            value={answer}
                            onChange={(event) => setAnswer(event.target.value)}
                            autoComplete="off"
                            spellCheck={false}
                            enterKeyHint="done"
                            maxLength={40}
                            aria-describedby={`${inputId}-help`}
                            className="w-44"
                            data-puzzle-answer
                        />
                        {puzzle.unit && <span className="text-sm text-fg-muted">{puzzle.unit}</span>}
                        <ActionButton type="submit" size="md" disabled={pending || !answer.trim()} data-puzzle-check>
                            {pending ? PUZZLE_COPY.checking : PUZZLE_COPY.check}
                        </ActionButton>
                    </div>
                    <p id={`${inputId}-help`} className="text-xs text-fg-muted">{PUZZLE_COPY.answerHint}</p>
                </form>
            )}

            <p role="status" aria-live="polite" data-puzzle-feedback={feedback ?? undefined}
               className={cn('min-h-5 text-sm', feedback === 'correct' ? 'text-positive' : feedback === 'close' ? 'text-warning' : 'text-fg-soft')}>
                {feedback === 'correct' ? PUZZLE_COPY.correct : feedbackText}
                {!closed && progress.attempts > 0 && <span className="ml-2 font-mono text-xs text-fg-muted">{PUZZLE_COPY.attempts(progress.attempts)}</span>}
            </p>

            {progress.hints.length > 0 && (
                <ol className="space-y-2" data-puzzle-hints>
                    {progress.hints.map((hint, i) => (
                        <RowCard as="li" key={hint} tone="brand" className="text-sm leading-relaxed text-fg">
                            <MicroLabel as="span" className="mr-2">{PUZZLE_COPY.hint(i + 1)}</MicroLabel>
                            {hint}
                        </RowCard>
                    ))}
                </ol>
            )}

            {!closed && (
                <div className="flex flex-wrap items-center gap-2">
                    {hintsLeft > 0 && (
                        <ActionButton variant="secondary" disabled={pending} data-puzzle-hint
                                      onClick={() => run(() => takePuzzleHint({puzzleId: puzzle.id, daily}))}>
                            {PUZZLE_COPY.takeHint} · {PUZZLE_COPY.hintsLeft(hintsLeft)}
                        </ActionButton>
                    )}
                    {!confirming ? (
                        <ActionButton variant="secondary" disabled={pending} onClick={() => setConfirming(true)} data-puzzle-reveal>
                            {PUZZLE_COPY.reveal}
                        </ActionButton>
                    ) : (
                        <span className="flex flex-wrap items-center gap-2" data-puzzle-reveal-confirm>
                            <span className="text-xs text-fg-soft">{PUZZLE_COPY.revealConfirm}</span>
                            <ActionButton variant="danger" disabled={pending} data-puzzle-reveal-yes
                                          onClick={() => run(() => revealPuzzleSolution({puzzleId: puzzle.id, daily}), () => setConfirming(false))}>
                                {PUZZLE_COPY.revealYes}
                            </ActionButton>
                            <ActionButton variant="secondary" disabled={pending} onClick={() => setConfirming(false)}>{PUZZLE_COPY.revealNo}</ActionButton>
                        </span>
                    )}
                </div>
            )}

            {closed && progress.answer && (
                <div className="space-y-3" data-puzzle-solution>
                    <div>
                        <MicroLabel as="p">{PUZZLE_COPY.answerHeading}</MicroLabel>
                        <p className="font-mono text-lg font-semibold text-fg" data-puzzle-answer-key>
                            {progress.answer}{puzzle.unit ? ` ${puzzle.unit}` : ''}
                        </p>
                    </div>
                    <div>
                        <MicroLabel as="p">{PUZZLE_COPY.solutionHeading}</MicroLabel>
                        <div className="mt-1 space-y-2">
                            {(progress.solution ?? []).map((sentence) => (
                                <p key={sentence} className="text-sm leading-relaxed text-fg-soft">{sentence}</p>
                            ))}
                        </div>
                    </div>
                    <p className={cn('font-mono text-xs', progress.status === 'solved' ? 'text-positive' : 'text-fg-muted')} data-puzzle-outcome>
                        {progress.status === 'solved' && progress.solvedAt
                            ? PUZZLE_COPY.solvedLine(formatEasternTimestamp(new Date(progress.solvedAt)), progress.attempts, progress.hints.length)
                            : PUZZLE_COPY.revealedLine}
                    </p>
                    {streak && streak.current > 0 && (
                        <p className="text-sm font-semibold text-brand" data-puzzle-streak={streak.current}>{STREAK_COPY.streak(streak.current)}</p>
                    )}
                </div>
            )}
        </div>
    );
};

export default PuzzleSolver;
