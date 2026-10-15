'use client';

import {useState} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {markUnitStudied} from "@/lib/actions/lab.actions";
import {LAB_COPY} from "@/lib/learn/copy/lab";
import ActionButton from "@/components/primitives/ActionButton";
import MicroLabel from "@/components/primitives/MicroLabel";

// The end of a unit page: one button, live once the unit's quiz is passed. The first click
// stamps the unit studied (its cards join the review tomorrow); a later click marks a revisit.
// The server re-renders the line; it refuses the mark before the quiz too (the gate is its).
type Props = {unitId: string; studiedOn: string | null; lastDay: string | null; quizPassed: boolean};

const MarkUnitStudied = ({unitId, studiedOn, lastDay, quizPassed}: Props) => {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const mark = async () => {
        if (busy) return;
        setBusy(true);
        const result = await markUnitStudied({unitId});
        setBusy(false);
        if (!result.success) {
            toast.error(result.message);
            return;
        }
        router.refresh();
    };
    return (
        <div className="flex flex-wrap items-center gap-3" data-lab-mark-block data-lab-mark-gated={!quizPassed || undefined}>
            <ActionButton variant={studiedOn ? 'secondary' : 'primary'} disabled={busy || !quizPassed} onClick={mark} data-lab-mark>
                {busy ? LAB_COPY.marking : studiedOn ? LAB_COPY.markAgain : LAB_COPY.markStudied}
            </ActionButton>
            {studiedOn && <MicroLabel data-lab-marked={studiedOn}>{LAB_COPY.markedLine(lastDay ?? studiedOn)}</MicroLabel>}
            {!quizPassed && <MicroLabel as="p" className="normal-case tracking-normal" data-lab-mark-note>{LAB_COPY.quiz.gateNote}</MicroLabel>}
        </div>
    );
};

export default MarkUnitStudied;
