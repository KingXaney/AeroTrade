'use client';

import {useState, type ReactNode} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {answerQuiz, type QuizActionResult} from "@/lib/actions/lab.actions";
import {LAB_COPY} from "@/lib/learn/copy/lab";
import {cn} from "@/lib/utils";
import ActionButton from "@/components/primitives/ActionButton";
import MicroLabel from "@/components/primitives/MicroLabel";

// A unit's quiz: one radio group per question, checked on the server (lib/actions/lab.actions
// .answerQuiz), which holds the answers. The page hands in the prompts and options already
// rendered (maths included); this component only collects the choices, marks the wrong ones on a
// fail, and shows the explanations once the quiz is passed. A pass is what lets the unit be
// marked studied, so the page re-renders after one.

export type QuizQuestionNode = {id: string; prompt: ReactNode; options: ReactNode[]};

type Props = {
    unitId: string;
    questions: readonly QuizQuestionNode[];
    passedOn: string | null;
    score: number | null;
};

type Outcome = Extract<QuizActionResult, {success: true}> | null;

const QuizCard = ({unitId, questions, passedOn, score}: Props) => {
    const router = useRouter();
    const [chosen, setChosen] = useState<(number | null)[]>(() => questions.map(() => null));
    const [outcome, setOutcome] = useState<Outcome>(null);
    const [busy, setBusy] = useState(false);
    const total = questions.length;
    const allAnswered = chosen.every((choice) => choice !== null);
    const passed = passedOn !== null || outcome?.passed === true;

    const check = async () => {
        if (busy || !allAnswered) return;
        setBusy(true);
        const result = await answerQuiz({unitId, answers: chosen.map((choice) => choice ?? 0)});
        setBusy(false);
        if (!result.success) {
            toast.error(result.message);
            return;
        }
        setOutcome(result);
        if (result.passed) router.refresh();
    };

    if (passedOn !== null && outcome === null) {
        return (
            <p className="text-sm text-fg-soft" data-lab-quiz={unitId} data-quiz-passed={passedOn}>
                {LAB_COPY.quiz.passedOn(passedOn)}{score !== null ? ` ${LAB_COPY.quiz.passed(score, total)}` : ''}
            </p>
        );
    }

    return (
        <div data-lab-quiz={unitId} data-quiz-passed={passed ? (passedOn ?? 'now') : undefined}>
            <p className="mb-4 text-sm text-fg-soft">{LAB_COPY.quiz.lead(total)}</p>
            <ol className="space-y-5">
                {questions.map((question, qi) => {
                    const wrong = outcome !== null && !outcome.passed && outcome.perQuestion[qi] === false;
                    const right = outcome !== null && outcome.perQuestion[qi] === true;
                    return (
                        <li key={question.id} data-quiz-question={qi} data-quiz-wrong={wrong || undefined}>
                            <fieldset disabled={passed || busy}>
                                <legend className={cn('mb-2 text-sm text-fg', wrong && 'text-warning')}>
                                    <span className="mr-2 font-mono text-xs text-fg-muted">{qi + 1}.</span>{question.prompt}
                                </legend>
                                <ul className="space-y-1.5">
                                    {question.options.map((option, oi) => {
                                        const id = `${question.id}-${oi}`;
                                        const picked = chosen[qi] === oi;
                                        return (
                                            <li key={id}>
                                                <label htmlFor={id} className={cn(
                                                    'row-card flex cursor-pointer items-start gap-3 px-3 py-2 text-sm',
                                                    picked && !wrong && !right && 'border-brand/50',
                                                    picked && wrong && 'border-warning/60',
                                                    picked && right && 'border-brand',
                                                    (passed || busy) && 'cursor-default',
                                                )}>
                                                    <input
                                                        type="radio"
                                                        id={id}
                                                        name={question.id}
                                                        value={oi}
                                                        checked={picked}
                                                        onChange={() => setChosen((prev) => prev.map((choice, i) => (i === qi ? oi : choice)))}
                                                        className="mt-1 shrink-0 accent-[var(--color-brand)]"
                                                        data-quiz-option={`${qi}:${oi}`}
                                                    />
                                                    <span className="min-w-0 flex-1 text-fg">{option}</span>
                                                </label>
                                            </li>
                                        );
                                    })}
                                </ul>
                                {passed && outcome?.why && (
                                    <p className="mt-2 text-xs text-fg-soft" data-quiz-why={qi}>
                                        <MicroLabel as="span" className="mr-2">{LAB_COPY.quiz.whyHeading}</MicroLabel>{outcome.why[qi]}
                                    </p>
                                )}
                            </fieldset>
                        </li>
                    );
                })}
            </ol>
            <div className="mt-5 flex flex-wrap items-center gap-3">
                {!passed && (
                    <ActionButton variant="primary" onClick={check} disabled={busy || !allAnswered} data-quiz-check>
                        {busy ? LAB_COPY.quiz.checking : outcome ? LAB_COPY.quiz.tryAgain : LAB_COPY.quiz.check}
                    </ActionButton>
                )}
                {!allAnswered && !passed && <MicroLabel as="span">{LAB_COPY.quiz.unanswered}</MicroLabel>}
                {outcome && <p className={cn('text-sm', outcome.passed ? 'text-brand' : 'text-warning')} data-quiz-result={outcome.passed ? 'passed' : 'failed'}>{outcome.message}</p>}
            </div>
        </div>
    );
};

export default QuizCard;
