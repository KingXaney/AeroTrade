'use client';

import {useEffect} from "react";
import Link from "next/link";
import EmptyState from "@/components/primitives/EmptyState";
import PageTitle from "@/components/primitives/PageTitle";

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

const action = 'font-mono px-4 py-2 rounded-[var(--control-radius)] text-xs font-bold uppercase tracking-[0.1em]';

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
                        <button type="button" onClick={reset} className={`${action} bg-brand text-on-brand`}>
                            Try again
                        </button>
                        <Link href="/" className={`${action} text-fg-soft border border-line-strong/40 hover:text-fg transition-colors`}>
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
