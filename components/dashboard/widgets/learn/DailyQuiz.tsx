'use client';

import Link from "next/link";
import {useState, useTransition} from "react";
import {cn} from "@/lib/utils";
import Badge from "@/components/primitives/Badge";
import MicroLabel from "@/components/primitives/MicroLabel";
import Term from "@/components/primitives/Term";
import ReasonGloss from "@/components/learn/ReasonGloss";
import {recordQuizAnswer} from "@/lib/actions/learn.actions";
import type {DailyQuiz as Quiz, QuizCell, QuizOption} from "@/lib/learn/quiz";
import {DAILY_QUIZ_COPY, daysAnsweredLine, quizBoardHref, quizEyebrow, quizOutcome, quizPrompt} from "@/lib/learn/copy/quiz";
import {STATE_LABEL, STATE_TONE} from "@/lib/strategies/views";

// The Daily quiz: one question a day from a strategy's recent signal board (built on the
// server by lib/learn/quiz.ts; plain data here). The first answer reveals the stored verdict
// and the rule's own reason, decoded clause by clause, and counts the day once
// (recordQuizAnswer). A dashboard widget, so labels carry titles (<Term>) and nothing else: no
// "What these mean", no "Ask in chat", no <details> (invariant 12). A reload asks the same
// question again; answering it again changes no count.

const Cells = ({cells}: {cells: readonly QuizCell[]}) => (
    <span className="flex flex-wrap gap-x-3 gap-y-0.5">
        {cells.map((cell) => (
            <span key={cell.label} className="text-xs">
                <MicroLabel>
                    {cell.term ? <Term k={cell.term}>{cell.label}</Term> : cell.label}{' '}
                </MicroLabel>
                <span className="font-mono text-fg-soft">{cell.value}</span>
            </span>
        ))}
    </span>
);

const OptionBody = ({quiz, option}: {quiz: Quiz; option: QuizOption}) => {
    switch (quiz.template) {
        case 'which-verdict':
            return <Badge tone={STATE_TONE[option.state]} variant="outline">{option.label}</Badge>;
        case 'why-this-verdict':
            return <span className="text-xs text-fg leading-snug">{option.label}</span>;
        case 'which-symbol':
            return (
                <span className="flex flex-col gap-1">
                    <span className="font-mono text-sm font-bold text-fg">{option.label}</span>
                    <Cells cells={option.cells} />
                </span>
            );
    }
};

type Props = {
    quiz: Quiz;
    daysAnswered: number;
};

const DailyQuiz = ({quiz, daysAnswered}: Props) => {
    const [picked, setPicked] = useState<string | null>(null);
    const [days, setDays] = useState(daysAnswered);
    const [note, setNote] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();
    const revealed = picked !== null;
    const inline = quiz.template === 'which-verdict';
    const daysLine = daysAnsweredLine(days);

    const choose = (id: string) => {
        if (revealed) return;
        setPicked(id);
        startTransition(async () => {
            const result = await recordQuizAnswer(quiz.date);
            if (result.success) setDays(result.daysAnswered);
            else setNote(result.message);
        });
    };

    return (
        <div id="daily-quiz" data-quiz-template={quiz.template} data-quiz-strategy={quiz.strategyId} data-quiz-date={quiz.date}>
            <MicroLabel>{quizEyebrow(quiz)}</MicroLabel>
            <p className="mt-1 text-sm text-fg leading-snug" data-quiz-prompt>{quizPrompt(quiz)}</p>
            {inline && (
                <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1" data-quiz-row={quiz.symbol ?? undefined}>
                    <span className="font-mono text-sm font-bold text-fg">{quiz.symbol}</span>
                    <Cells cells={quiz.cells} />
                </div>
            )}
            <ul className={cn('mt-3', inline ? 'flex flex-wrap gap-2' : 'space-y-1.5')} role="group" aria-label={DAILY_QUIZ_COPY.optionsLabel}>
                {quiz.options.map((option) => {
                    const chosen = picked === option.id;
                    const correct = option.id === quiz.answerId;
                    return (
                        <li key={option.id}>
                            <button
                                type="button"
                                data-quiz-option={option.id}
                                data-quiz-correct={revealed ? String(correct) : undefined}
                                aria-pressed={chosen}
                                disabled={revealed}
                                onClick={() => choose(option.id)}
                                className={cn(
                                    'flex items-start justify-between gap-3 text-left rounded-md border transition-colors disabled:cursor-default',
                                    inline ? 'px-2 py-1.5' : 'w-full px-3 py-2',
                                    !revealed && 'border-line-strong/30 hover:border-brand',
                                    revealed && correct && 'border-positive/60',
                                    revealed && chosen && !correct && 'border-negative/60',
                                    revealed && !chosen && !correct && 'border-line-strong/20 opacity-60',
                                )}
                            >
                                <OptionBody quiz={quiz} option={option} />
                                {revealed && !inline && (
                                    <Badge tone={STATE_TONE[option.state]} variant={correct ? 'solid' : 'outline'} className="shrink-0">
                                        {STATE_LABEL[option.state]}
                                    </Badge>
                                )}
                            </button>
                        </li>
                    );
                })}
            </ul>
            {revealed && (
                <div className="mt-3 space-y-1.5" data-quiz-reveal={quiz.reveal.symbol} data-quiz-verdict={quiz.reveal.verdict}>
                    <p className="flex flex-wrap items-center gap-2 text-[11px] text-fg-muted">
                        <span className={cn('font-mono', picked === quiz.answerId ? 'text-positive' : 'text-negative')} data-quiz-outcome>
                            {quizOutcome(picked === quiz.answerId)}
                        </span>
                        <span className="font-mono text-sm font-bold text-fg">{quiz.reveal.symbol}</span>
                        <MicroLabel as="span">{DAILY_QUIZ_COPY.verdictLabel}</MicroLabel>
                        <Badge tone={STATE_TONE[quiz.reveal.verdict]} variant="solid">{STATE_LABEL[quiz.reveal.verdict]}</Badge>
                    </p>
                    <p className="text-[11px] text-fg-muted">
                        <MicroLabel as="span">{DAILY_QUIZ_COPY.reasonLabel}</MicroLabel>{' '}
                        <span className="font-mono text-fg-soft break-words" data-quiz-explanation>{quiz.reveal.explanation}</span>
                    </p>
                    <ReasonGloss clauses={quiz.reveal.gloss} quoted={quiz.reveal.explanation} className="pl-1" />
                    <Link href={quizBoardHref(quiz.strategyId)} className="inline-block font-mono text-[11px] text-brand hover:underline">
                        {DAILY_QUIZ_COPY.boardLink}
                    </Link>
                </div>
            )}
            {(daysLine || pending) && (
                <p className="mt-3 font-mono text-[11px] text-fg-muted">
                    {pending ? DAILY_QUIZ_COPY.saving : <span data-quiz-days>{daysLine}</span>}
                </p>
            )}
            {note && <p className="mt-1 font-mono text-[11px] text-warning" data-quiz-note>{note}</p>}
        </div>
    );
};

export default DailyQuiz;
