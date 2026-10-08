'use client';

import {useEffect} from "react";
import ActionButton, {actionButton} from "@/components/primitives/ActionButton";
import EmptyState from "@/components/primitives/EmptyState";
import {HomeLink} from "@/components/poker-night/HomeLink";
import {TABLE_COPY} from "@/lib/learn/copy/poker-night";

// The table's error boundary: a failed room read, a session read that could not be made, a newer
// deploy's state. Inside the (play) layout, so the theme holds; its words are the table's own
// (TABLE_COPY), and Try again re-fetches the page (Next 16's retry). The way out is Home ("/", a full
// page load): the app's Home for an account, the landing page for a guest — never the lobby, which
// sends a guest to sign in. The error's message is never shown — a server error's carries only a
// digest, and a client one may carry detail.
const PlayError = ({error, retry}: {error: Error & {digest?: string}; retry: () => void}) => {
    useEffect(() => {
        console.error('Poker night table failed:', error);
    }, [error]);

    return (
        <main className="mx-auto flex min-h-dvh w-full max-w-lg items-center p-4">
            <EmptyState
                size="panel"
                icon="error"
                className="w-full"
                title={TABLE_COPY.errorTitle}
                description={TABLE_COPY.errorBody}
                action={
                    <>
                        <ActionButton size="md" onClick={retry}>
                            {TABLE_COPY.retry}
                        </ActionButton>
                        <HomeLink className={actionButton({variant: 'secondary', size: 'md'})} data-pn-home="">
                            {TABLE_COPY.home}
                        </HomeLink>
                    </>
                }
            />
        </main>
    );
};

export default PlayError;
