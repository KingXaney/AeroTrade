'use client';

import {useState} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {UNREACHABLE_MESSAGE} from "@/lib/action-toast";
import {resetArithmeticSkill} from "@/lib/actions/games.actions";
import {ARITHMETIC_COPY} from "@/lib/learn/copy/games";
import ActionButton from "@/components/primitives/ActionButton";
import MicroLabel from "@/components/primitives/MicroLabel";

// "Start over" on the skill panel: a two-step inline confirm, then the reader's aggregate of
// timed problems is deleted on the server and the page re-reads. Records are untouched.
const SkillResetButton = () => {
    const router = useRouter();
    const [asking, setAsking] = useState(false);
    const [busy, setBusy] = useState(false);
    const clear = async () => {
        if (busy) return;
        setBusy(true);
        const result = await resetArithmeticSkill().catch(() => ({success: false as const, message: UNREACHABLE_MESSAGE}));
        setBusy(false);
        if (!result.success) {
            toast.error(result.message);
            return;
        }
        setAsking(false);
        router.refresh();
    };
    if (!asking) return <ActionButton variant="secondary" size="sm" onClick={() => setAsking(true)} data-skill-reset>{ARITHMETIC_COPY.startOver}</ActionButton>;
    return (
        <span className="flex flex-wrap items-center gap-2">
            <MicroLabel as="span" className="normal-case tracking-normal">{ARITHMETIC_COPY.startOverConfirm}</MicroLabel>
            <ActionButton variant="danger" size="sm" onClick={clear} disabled={busy} data-skill-reset-yes>{ARITHMETIC_COPY.startOverYes}</ActionButton>
            <ActionButton variant="secondary" size="sm" onClick={() => setAsking(false)} disabled={busy} data-skill-reset-no>{ARITHMETIC_COPY.startOverNo}</ActionButton>
        </span>
    );
};

export default SkillResetButton;
