'use client';

import {useTransition} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {dismissMissions} from "@/lib/actions/learn.actions";
import {MISSIONS_HIDE_FAILED, MISSIONS_HIDE_LABEL, MISSIONS_HIDING} from "@/lib/learn/copy/missions";

const HideMissionsButton = () => {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    return (
        <button
            type="button"
            id="missions-hide"
            disabled={pending}
            onClick={() => startTransition(async () => {
                const result = await dismissMissions();
                if (!result.success) {
                    toast.error(result.message ?? MISSIONS_HIDE_FAILED);
                    return;
                }
                router.refresh();
            })}
            className="font-mono text-[11px] text-fg-muted hover:text-fg transition-colors disabled:opacity-50"
        >
            {pending ? MISSIONS_HIDING : MISSIONS_HIDE_LABEL}
        </button>
    );
};

export default HideMissionsButton;
