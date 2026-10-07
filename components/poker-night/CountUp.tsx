'use client';

// A winner's stack counting up on their plate: the count stepped as text in the plate's own format
// (lib/poker-night/chips: "1,980" … "2,050", "125k"), on the table's timeline — the wait and the
// length are in units of --motion-base, read off the element, so brutalist and both motion guards
// (they zero the token) show the new count at once. Text a timer steps, not an animation: a CSS
// counter cannot print the separators every other stack shows. The plate keeps the count in its
// accessible text beside it; this is for the eye only.

import {useEffect, useRef, useState} from "react";
import {compactChips, countUpValue, cssTimeMs} from "@/lib/poker-night/chips";

// How often the count steps.
const STEP_MS = 50;

type Props = {
    from: number;
    to: number;
    at: number; // when it starts, in units of --motion-base from now
    dur: number; // how long it runs, in the same units
};

const CountUp = ({from, to, at, dur}: Props) => {
    const ref = useRef<HTMLSpanElement>(null);
    const [shown, setShown] = useState(from);

    useEffect(() => {
        const el = ref.current;
        const unit = el ? cssTimeMs(getComputedStyle(el).getPropertyValue('--motion-base')) : 0;
        const start = Date.now() + Math.max(0, at) * unit;
        const length = Math.max(0, dur) * unit;
        let timer: ReturnType<typeof setInterval> | null = null;
        const step = () => {
            const value = countUpValue(from, to, Date.now() - start, length);
            setShown(value);
            if (value === to && Date.now() >= start + length && timer !== null) {
                clearInterval(timer);
                timer = null;
            }
        };
        const first = setTimeout(step, 0);
        timer = setInterval(step, STEP_MS);
        return () => {
            clearTimeout(first);
            if (timer !== null) clearInterval(timer);
        };
    }, [from, to, at, dur]);

    return <span ref={ref} aria-hidden="true" data-anim="count-up" data-count-to={to}>{compactChips(shown)}</span>;
};

export default CountUp;
