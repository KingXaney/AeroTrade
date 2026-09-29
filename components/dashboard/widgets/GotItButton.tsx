'use client';

import {useTransition} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {markLessonSeen} from "@/lib/actions/learn.actions";
import type {LessonId} from "@/lib/learn/moments";

// Today's lesson "Got it": stamps the moment's key (the action validates it) and refreshes, so
// the next moment or the day's concept takes its place. The labels come from the server
// widget (lib/learn/copy/lesson.ts), which keeps the catalog and zod out of this bundle.

type Props = {
    lessonId: LessonId;
    label: string;
    pendingLabel: string;
    failedLabel: string;
};

const GotItButton = ({lessonId, label, pendingLabel, failedLabel}: Props) => {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    return (
        <button
            type="button"
            id="lesson-got-it"
            disabled={pending}
            onClick={() => startTransition(async () => {
                const result = await markLessonSeen(lessonId);
                if (!result.success) {
                    toast.error(result.message ?? failedLabel);
                    return;
                }
                router.refresh();
            })}
            className="shrink-0 rounded-md border border-line-strong/30 px-3 py-1.5 font-mono text-[11px] text-fg hover:border-brand hover:text-brand transition-colors disabled:opacity-50"
        >
            {pending ? pendingLabel : label}
        </button>
    );
};

export default GotItButton;
