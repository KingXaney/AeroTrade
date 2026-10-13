'use client';

import {useState} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {markUnitStudied} from "@/lib/actions/lab.actions";
import {LAB_COPY} from "@/lib/learn/copy/lab";
import ActionButton from "@/components/primitives/ActionButton";
import MicroLabel from "@/components/primitives/MicroLabel";

// The end of a unit page: one button. The first click stamps the unit studied (its cards join the
// review tomorrow); a later click marks a revisit. The server re-renders the line.
const MarkUnitStudied = ({unitId, studiedOn, lastDay}: {unitId: string; studiedOn: string | null; lastDay: string | null}) => {
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
        <div className="flex flex-wrap items-center gap-3" data-lab-mark-block>
            <ActionButton variant={studiedOn ? 'secondary' : 'primary'} disabled={busy} onClick={mark} data-lab-mark>
                {busy ? LAB_COPY.marking : studiedOn ? LAB_COPY.markAgain : LAB_COPY.markStudied}
            </ActionButton>
            {studiedOn && <MicroLabel data-lab-marked={studiedOn}>{LAB_COPY.markedLine(lastDay ?? studiedOn)}</MicroLabel>}
        </div>
    );
};

export default MarkUnitStudied;
