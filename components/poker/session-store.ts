'use client';

import {useCallback, useState} from "react";

// The solver's inputs and last results for the life of the page session: each tab is its own view
// (?tab=), so switching tabs unmounts the others, and this is what brings back what a tab held.
// Nothing is saved anywhere; a reload starts over.

const store = new Map<string, unknown>();

export const readSession = <T,>(key: string): T | undefined => store.get(key) as T | undefined;
export const writeSession = <T,>(key: string, value: T): void => {
    store.set(key, value);
};

export const useSessionState = <T,>(key: string, initial: () => T): [T, (next: T | ((previous: T) => T)) => void] => {
    const [value, setValue] = useState<T>(() => (store.has(key) ? (store.get(key) as T) : initial()));
    const set = useCallback((next: T | ((previous: T) => T)) => {
        setValue((previous) => {
            const resolved = typeof next === 'function' ? (next as (previous: T) => T)(previous) : next;
            store.set(key, resolved);
            return resolved;
        });
    }, [key]);
    return [value, set];
};
