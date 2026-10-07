'use client';

// The felt: a stadium under the seats (lib/poker-night/stage's felt rectangle, so each plate
// straddles the rail), in the host's felt (LOOKS_CSS, [data-pn-felt] — on the room and on the felt
// itself) with its betting line printed on it; while no pot is out, the table's name printed faintly
// where the pot goes. When the host picks another felt the cloth fades in anew (.pn-scene-fade, on
// the motion token); which felt was before is worked out during render. rounded-full keeps the
// stadium in brutalist, whose square corners spare that class alone.

import {useState} from "react";
import {useRoom} from "@/components/poker-night/room-controller";
import {resolveTableLook} from "@/lib/poker-night/looks";
import type {Stage} from "@/lib/poker-night/stage";
import type {FeltId} from "@/lib/poker-night/types";
import {cn} from "@/lib/utils";

const TableFelt = ({stage, name, showName}: {stage: Stage; name: string; showName: boolean}) => {
    const room = useRoom();
    const {felt} = resolveTableLook(room.table.settings);
    const [shown, setShown] = useState<{felt: FeltId; n: number}>({felt, n: 0});
    if (shown.felt !== felt) setShown({felt, n: shown.n + 1});
    return (
        <>
            <div key={shown.n} className={cn('pn-felt rounded-full', shown.n > 0 && 'pn-scene-fade')} style={stage.felt} aria-hidden="true"
                 data-pn-felt={felt} data-pn-felt-layer=""/>
            {showName && (
                <span className="pn-felt-name" style={{left: stage.pot.x, top: stage.pot.y}} aria-hidden="true" data-user-text="">{name}</span>
            )}
        </>
    );
};

export default TableFelt;
