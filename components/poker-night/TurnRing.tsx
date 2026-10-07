'use client';

// The countdown ring round the avatar of the player on the clock: the share of the turn left, from
// the turn's deadline on the server's clock (the room's offset), in the brand colour, then the
// warning colour at 30 %, the negative one at 10 % (lib/poker-night/client-clock.turnTone; the
// seconds are printed in the dock for the viewer's own turn, so colour is never the only cue). The
// server's two seconds of grace are never shown. It steps once a second and a CSS transition runs
// it smoothly to where the next second will be; brutalist and both motion guards turn the
// transition off, so it steps.

import {useServerNow} from "@/components/poker-night/room-controller";
import {TABLE_COPY} from "@/lib/learn/copy/poker-night";
import {turnLeft, turnTone} from "@/lib/poker-night/client-clock";
import {cn} from "@/lib/utils";

const TONE = {brand: 'text-brand', warning: 'text-warning', negative: 'text-negative'} as const;

const TurnRing = ({deadline, turnMs}: {deadline: number; turnMs: number}) => {
    const now = useServerNow(1000);
    const left = turnLeft(deadline, turnMs, now, 0);
    if (!left) return null;
    // Where the ring will be when the next tick comes: the transition arrives there on time.
    const ahead = turnLeft(deadline, turnMs, now + 1000, 0)!;
    return (
        <svg className={cn('pn-turn-ring-svg', TONE[turnTone(left.fraction)])} viewBox="0 0 36 36" role="timer" aria-live="off" aria-label={TABLE_COPY.timer} data-turn-left={left.seconds}>
            <circle cx="18" cy="18" r="16.5" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5"/>
            <circle className="pn-turn-ring" cx="18" cy="18" r="16.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                    pathLength={100} strokeDasharray="100" strokeDashoffset={100 * (1 - ahead.fraction)}/>
        </svg>
    );
};

export default TurnRing;
