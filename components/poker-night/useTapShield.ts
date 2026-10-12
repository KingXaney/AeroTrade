'use client';

// The tap shield of a row of buttons that takes another's place under the thumb (the action bar as
// the turn starts, the seat's own controls as a hand ends): a pointer tap that lands within
// lib/poker-night/keys.TAP_SHIELD_MS of the row appearing was aimed at what was there before, so
// `lands` turns it down; a keyboard's click (detail 0) always lands. `armed` turns true once the
// shield is over, for the row's data-pn-armed (what a test waits for). The row is shielded from the
// moment it mounts: a component that remounts it (a key) shields it again.

import {useEffect, useRef, useState} from "react";
import {TAP_SHIELD_MS, tapLands} from "@/lib/poker-night/keys";

type Tap = {detail: number; timeStamp: number};

export const useTapShield = (): {armed: boolean; lands: (e: Tap) => boolean} => {
    const shownAt = useRef<number | null>(null);
    const [armed, setArmed] = useState(false);
    useEffect(() => {
        shownAt.current = performance.now();
        const timer = setTimeout(() => setArmed(true), TAP_SHIELD_MS);
        return () => clearTimeout(timer);
    }, []);
    const lands = (e: Tap): boolean => e.detail === 0 || (shownAt.current !== null && tapLands(shownAt.current, e.timeStamp));
    return {armed, lands};
};
