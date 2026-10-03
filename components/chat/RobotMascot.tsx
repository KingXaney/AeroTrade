import {cn} from "@/lib/utils";

// The assistant's one face: the launcher's robot (components/chat/ChatWidget) and, `still`, the
// chat panel's header icon. An inline SVG drawn in currentColor only — text-on-brand on the disc,
// text-brand in the panel — so it reads on any palette (invariant 5). It moves by CSS keyframes
// alone (app/globals.css: .robot-bob on the wrapper, .robot-eyes blink, .robot-antenna glow; the
// hover tilt rides .robot-mascot under .robot-launcher), each listed in both reduced-motion guards
// and stopped by name in brutalist. No SMIL, no Web Animations: the sweep's STILL css and the
// guards stop everything it does. Pure markup, so it needs no 'use client' of its own.

type RobotMascotProps = {
    className?: string;
    // Drops the loops: the panel header's icon stands still.
    still?: boolean;
};

const RobotMascot = ({className, still = false}: RobotMascotProps) => (
    <span className={cn('inline-flex', !still && 'robot-bob')}>
        <svg
            viewBox="0 0 40 40"
            aria-hidden="true"
            focusable="false"
            data-robot-mascot
            className={cn('robot-mascot', className)}
            fill="none"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            {/* antenna, its tip the one glowing part */}
            <path d="M20 9V6"/>
            <circle className={still ? undefined : 'robot-antenna'} cx="20" cy="4" r="2" fill="currentColor" stroke="none"/>
            {/* ear bolts */}
            <path d="M6 18v6M34 18v6"/>
            {/* the head, outlined so one colour works on any ground */}
            <rect x="8" y="9" width="24" height="22" rx="7"/>
            <g className={still ? undefined : 'robot-eyes'} fill="currentColor" stroke="none">
                <rect x="13.5" y="17" width="4" height="6.5" rx="2"/>
                <rect x="22.5" y="17" width="4" height="6.5" rx="2"/>
            </g>
            {/* a small smile */}
            <path d="M15.5 26.5c1.5 2 7.5 2 9 0"/>
        </svg>
    </span>
);

export default RobotMascot;
