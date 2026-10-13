'use client';

import {useState, type ReactNode} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {answerProblem, revealProblem} from "@/lib/actions/lab.actions";
import {LAB_COPY} from "@/lib/learn/copy/lab";
import ActionButton from "@/components/primitives/ActionButton";
import MicroLabel from "@/components/primitives/MicroLabel";
import TextField from "@/components/primitives/TextField";

// The day's problem: its statement (rendered on the server), hints one at a time, an answer box
// when the answer is one number, and the worked solution once it is opened — by a correct answer
// or by asking. The solution reaches this component only after the server has stamped the
// problem closed; before that it is not in the page at all.
type Props = {
    problemId: string;
    numeric: boolean;
    unit?: string;
    hints: readonly string[];
    closedLine: string | null;
    statement: ReactNode;
    solution: ReactNode | null;
};

const ProblemCard = ({problemId, numeric, unit, hints, closedLine, statement, solution}: Props) => {
    const router = useRouter();
    const [hintsShown, setHintsShown] = useState(0);
    const [answer, setAnswer] = useState('');
    const [verdict, setVerdict] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const check = async () => {
        if (busy || answer.trim().length === 0) return;
        setBusy(true);
        const result = await answerProblem({problemId, answer: answer.trim()});
        setBusy(false);
        if (!result.success) {
            toast.error(result.message);
            return;
        }
        setVerdict(result.message ?? null);
        if (result.check === 'correct' || result.check === 'close') router.refresh();
    };

    const reveal = async () => {
        if (busy) return;
        setBusy(true);
        const result = await revealProblem({problemId});
        setBusy(false);
        if (!result.success) {
            toast.error(result.message);
            return;
        }
        router.refresh();
    };

    return (
        <div data-lab-problem={problemId} data-lab-problem-closed={solution !== null ? 'true' : 'false'}>
            <div data-lab-statement>{statement}</div>
            {hints.length > 0 && (
                <div className="mt-3 space-y-2" data-lab-hints>
                    {hints.slice(0, hintsShown).map((hint, i) => (
                        <p key={i} className="text-sm text-fg-soft" data-lab-hint={i + 1}>
                            <MicroLabel as="span" className="mr-2">{LAB_COPY.hintOf(i + 1, hints.length)}</MicroLabel>{hint}
                        </p>
                    ))}
                    {hintsShown < hints.length && solution === null && (
                        <ActionButton variant="secondary" size="sm" onClick={() => setHintsShown((n) => n + 1)} data-lab-next-hint>{LAB_COPY.nextHint}</ActionButton>
                    )}
                </div>
            )}
            {solution === null ? (
                <div className="mt-4 flex flex-wrap items-end gap-2">
                    {numeric && (
                        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void check(); }}>
                            <label className="flex flex-col gap-1">
                                <MicroLabel as="span">{unit ? `${LAB_COPY.answerLabel} (${unit})` : LAB_COPY.answerLabel}</MicroLabel>
                                <TextField value={answer} onChange={(e) => setAnswer(e.target.value)} maxLength={40} className="w-40" data-lab-answer/>
                            </label>
                            <ActionButton type="submit" variant="primary" disabled={busy || answer.trim().length === 0} data-lab-check>{LAB_COPY.check}</ActionButton>
                        </form>
                    )}
                    <ActionButton variant="secondary" disabled={busy} onClick={reveal} data-lab-reveal>{LAB_COPY.reveal}</ActionButton>
                </div>
            ) : (
                <div className="mt-4 border-t border-line-strong/25 pt-4" data-lab-solution>
                    <MicroLabel as="p" className="mb-2">{LAB_COPY.solutionHeading}{closedLine ? ` · ${closedLine}` : ''}</MicroLabel>
                    {solution}
                </div>
            )}
            {verdict && solution === null && <p className="mt-2 text-sm text-fg-soft" data-lab-verdict>{verdict}</p>}
        </div>
    );
};

export default ProblemCard;
