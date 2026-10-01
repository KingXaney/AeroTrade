'use client';

import {useEffect} from "react";
import Panel from "@/components/primitives/Panel";

// Route-level boundary: a failed feed never blanks the shell.
const NewsError = ({error, reset}: {error: Error & {digest?: string}; reset: () => void}) => {
    useEffect(() => { console.error('News page failed:', error); }, [error]);
    return (
        <div className="space-y-4">
            <div className="mb-2">
                <h1 className="text-2xl font-semibold text-fg mb-1" style={{fontFamily: 'var(--type-display)'}}>News</h1>
            </div>
            <Panel pad={8} className="text-center">
                <p className="text-sm text-fg-muted">Couldn&apos;t load your feed.</p>
                <button type="button" onClick={reset}
                        className="mt-4 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-[0.1em] bg-brand text-on-brand"
                        style={{fontFamily: 'var(--type-mono)'}}>
                    Retry
                </button>
            </Panel>
        </div>
    );
};

export default NewsError;
