'use client';

// The screen stays on while the viewer sits at the table (P6): the Screen Wake Lock API, taken
// while `on` — seated, with the personal keepAwake on — and the page is in front, taken again each
// time it comes back (a browser lets the lock go whenever the page hides), and let go when the
// viewer stands up, turns it off or leaves. A browser without the API, or one that refuses (low
// battery, a setting), simply lets the screen sleep.

import {useEffect} from "react";

export const useWakeLock = (on: boolean): void => {
    useEffect(() => {
        if (!on || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
        let stopped = false;
        let lock: WakeLockSentinel | null = null;
        let asking = false;

        const take = async () => {
            if (stopped || asking || lock !== null || document.hidden) return;
            asking = true;
            try {
                const held = await navigator.wakeLock.request('screen');
                if (stopped) {
                    void held.release().catch(() => undefined);
                    return;
                }
                lock = held;
                held.addEventListener('release', () => {
                    if (lock === held) lock = null;
                });
            } catch {
                // Refused: the screen may sleep.
            } finally {
                asking = false;
            }
        };
        const onVisibility = () => {
            if (!document.hidden) void take();
        };

        void take();
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            stopped = true;
            document.removeEventListener('visibilitychange', onVisibility);
            const held = lock;
            lock = null;
            if (held) void held.release().catch(() => undefined);
        };
    }, [on]);
};
