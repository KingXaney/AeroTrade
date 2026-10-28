'use client';

import {useState} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import ActionButton from "@/components/primitives/ActionButton";
import {runWithToast} from "@/lib/action-toast";
import {runAgentWorldNow} from "@/lib/actions/agent-world.actions";
import {ACTION_COPY, FLOOR_COPY} from "@/lib/learn/copy/agent-world";

// The owner's two ways to start a session by hand: a manual session (it trades as the weekly one
// does, once approved) and a preview (the desk runs and plans; nothing is traded). Both are refused
// while a session holds the desk.
const RunNowButton = ({live, onStarted}: {live: boolean; onStarted?: () => void}) => {
    const router = useRouter();
    const [busy, setBusy] = useState<'run' | 'preview' | null>(null);
    const start = async (preview: boolean) => {
        setBusy(preview ? 'preview' : 'run');
        const ok = await runWithToast(() => runAgentWorldNow({preview}), toast, {success: preview ? ACTION_COPY.previewStarted : ACTION_COPY.started, error: ACTION_COPY.notQueued});
        setBusy(null);
        if (ok) {
            router.refresh();
            onStarted?.();
        }
    };
    return (
        <div className="flex flex-wrap gap-2">
            <ActionButton variant="strong" size="sm" data-aw-run-now disabled={live || busy !== null} title={live ? FLOOR_COPY.runNowLive : undefined} onClick={() => void start(false)}>
                {busy === 'run' ? FLOOR_COPY.runNowBusy : FLOOR_COPY.runNow}
            </ActionButton>
            <ActionButton variant="secondary" size="sm" data-aw-preview disabled={live || busy !== null} title={live ? FLOOR_COPY.runNowLive : FLOOR_COPY.previewHint} onClick={() => void start(true)}>
                {busy === 'preview' ? FLOOR_COPY.runNowBusy : FLOOR_COPY.preview}
            </ActionButton>
        </div>
    );
};

export default RunNowButton;
