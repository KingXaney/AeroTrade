'use client';

import {useCallback, useEffect, useRef} from "react";

// Returns a stable debounced wrapper around `fn`. Each call resets the timer; the wrapped
// function only runs after `delay` ms of quiet. Cancels on unmount to avoid late state updates.
export function useDebounce<TArgs extends unknown[]>(
    fn: (...args: TArgs) => void | Promise<void>,
    delay: number,
) {
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const fnRef = useRef(fn);

    // Keep latest fn without retriggering callers; debounced wrapper stays referentially stable.
    useEffect(() => {
        fnRef.current = fn;
    }, [fn]);

    useEffect(() => {
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, []);

    return useCallback((...args: TArgs) => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            void fnRef.current(...args);
        }, delay);
    }, [delay]);
}

export default useDebounce;
