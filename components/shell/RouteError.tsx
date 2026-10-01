'use client';

import {useEffect} from "react";
import Link from "next/link";
import EmptyState from "@/components/primitives/EmptyState";
import PageTitle from "@/components/primitives/PageTitle";
import ActionButton, {actionButton} from "@/components/primitives/ActionButton";

// The shared route error boundary. Before this existed only /topics had one, so a failed
// price call on /portfolio blanked the whole app — header, sidebar and chat included —
// with no way back but the browser's Back button. Rendering inside the (root) layout
// keeps the chrome and the user's theme, so a failure looks like a failure and not a
// broken deploy.
type Props = {
    error: Error & {digest?: string};
    reset: () => void;
    title?: string;
    message?: string;
};

const RouteError = ({error, reset, title = 'Something went wrong', message}: Props) => {
    useEffect(() => {
        console.error('Route failed:', error);
    }, [error]);

    return (
        <div className="space-y-4">
            <PageTitle title={title} />
            <EmptyState
                size="panel"
                icon="error"
                title="This page couldn't load"
                description={message ?? "It's usually a hiccup talking to the market data provider."}
                action={
                    <>
                        <ActionButton size="md" onClick={reset}>
                            Try again
                        </ActionButton>
                        <Link href="/" className={actionButton({variant: 'secondary', size: 'md'})}>
                            Dashboard
                        </Link>
                    </>
                }
                /* The digest is the only handle on a server-side failure in production logs.
                   error.message itself is never shown — it can carry infrastructure detail. */
                note={error.digest ? `Reference ${error.digest}` : undefined}
            />
        </div>
    );
};

export default RouteError;
