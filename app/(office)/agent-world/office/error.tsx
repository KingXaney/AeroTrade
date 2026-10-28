'use client';

import {useEffect} from "react";
import ActionButton, {actionButton} from "@/components/primitives/ActionButton";
import EmptyState from "@/components/primitives/EmptyState";
import {OFFICE_COPY} from "@/lib/learn/copy/agent-world-office";

// The office's error boundary: a failed read of the session. Inside the office's layout, so the
// theme holds; Try again re-fetches the page (Next 16's retry), and the way back is the floor, a
// plain link (a full page load into the app's shell). The error's message is never shown.
const OfficeError = ({error, retry}: {error: Error & {digest?: string}; retry: () => void}) => {
    useEffect(() => {
        console.error('Agent office failed:', error);
    }, [error]);

    return (
        <main className="mx-auto flex min-h-dvh w-full max-w-lg items-center p-4">
            <EmptyState
                size="panel"
                icon="error"
                className="w-full"
                title={OFFICE_COPY.errorTitle}
                description={OFFICE_COPY.errorBody}
                action={
                    <>
                        <ActionButton size="md" onClick={retry}>{OFFICE_COPY.retry}</ActionButton>
                        <a href="/agent-world" data-office-back className={actionButton({variant: 'secondary', size: 'md'})}>{OFFICE_COPY.back}</a>
                    </>
                }
            />
        </main>
    );
};

export default OfficeError;
