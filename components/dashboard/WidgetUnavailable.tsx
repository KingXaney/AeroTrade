'use client';

import {useRouter} from "next/navigation";

// Shown when a widget's loader failed (Retry re-runs the server render) or its data is empty.
const WidgetUnavailable = ({failed = false, text}: {failed?: boolean; text?: string}) => {
    const router = useRouter();
    if (!failed) return <p className="text-sm text-fg-muted">{text ?? 'Nothing to show yet.'}</p>;
    return (
        <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-fg-muted">{text ?? "Couldn't load this widget."}</p>
            <button type="button" onClick={() => router.refresh()}
                    className="label-type text-xs text-brand hover:underline">
                Retry
            </button>
        </div>
    );
};

export default WidgetUnavailable;
