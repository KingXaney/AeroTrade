'use client';

import {useEffect} from "react";
import Link from "next/link";

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
            <div className="mb-2">
                <h1 className="text-2xl font-semibold text-fg mb-1 tracking-tight"
                    style={{fontFamily: 'var(--type-display)'}}>
                    {title}
                </h1>
            </div>
            <section className="glass-panel rounded-xl p-8 text-center">
                <p className="text-sm text-fg-muted">
                    {message ?? "This page couldn't load. It's usually a hiccup talking to the market data provider."}
                </p>
                <div className="mt-5 flex items-center justify-center gap-3">
                    <button
                        type="button"
                        onClick={reset}
                        className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-[0.1em] bg-brand text-on-brand"
                        style={{fontFamily: 'var(--type-mono)'}}
                    >
                        Try again
                    </button>
                    <Link
                        href="/"
                        className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-[0.1em] text-fg-soft border border-line-strong/40 hover:text-fg transition-colors"
                        style={{fontFamily: 'var(--type-mono)'}}
                    >
                        Dashboard
                    </Link>
                </div>
                {/* The digest is the only handle on a server-side failure in production logs.
                    error.message itself is never shown — it can carry infrastructure detail. */}
                {error.digest && (
                    <p className="mt-4 text-[10px] text-fg-muted" style={{fontFamily: 'var(--type-mono)'}}>
                        Reference {error.digest}
                    </p>
                )}
            </section>
        </div>
    );
};

export default RouteError;
