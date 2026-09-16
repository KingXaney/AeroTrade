'use client';

import {useEffect} from "react";

// Route-level boundary: a failed topics read never blanks the shell.
const TopicsError = ({error, reset}: {error: Error & {digest?: string}; reset: () => void}) => {
    useEffect(() => { console.error('Topics page failed:', error); }, [error]);
    return (
        <div className="space-y-4">
            <div className="mb-2">
                <h1 className="text-2xl font-semibold text-fg mb-1" style={{fontFamily: 'var(--type-display)'}}>Topics</h1>
            </div>
            <section className="glass-panel rounded-xl p-8 text-center">
                <p className="text-sm text-fg-muted">Couldn&apos;t load your topics.</p>
                <button type="button" onClick={reset}
                        className="mt-4 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-[0.1em] bg-brand text-on-brand"
                        style={{fontFamily: 'var(--type-mono)'}}>
                    Retry
                </button>
            </section>
        </div>
    );
};

export default TopicsError;
