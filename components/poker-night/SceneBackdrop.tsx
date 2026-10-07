'use client';

// The scene behind the table: the host's choice of room (lib/poker-night/looks SCENES), its sky
// painted from LOOKS_CSS's --pn-sky by the layer's own [data-pn-scene], and its art and ambient loop
// drawn over it (SceneArt). Decoration only; nothing readable ever sits on it bare.
//
// When the host picks another scene, the new one fades in over the one it replaces
// (.pn-scene-fade, on the motion token, so a guard or brutalist shows it at once); the old sky stays
// beneath it, without its art, until the next change. Which scene was before is worked out during
// render (the React pattern for state that follows a prop), never in an effect.

import {useState} from "react";
import SceneArt from "@/components/poker-night/SceneArt";
import {useRoom} from "@/components/poker-night/room-controller";
import {resolveTableLook, SCENES} from "@/lib/poker-night/looks";
import type {SceneId} from "@/lib/poker-night/types";
import {cn} from "@/lib/utils";

const SceneBackdrop = () => {
    const room = useRoom();
    const {scene} = resolveTableLook(room.table.settings);
    const [shown, setShown] = useState<{scene: SceneId; prev: SceneId | null; n: number}>({scene, prev: null, n: 0});
    if (shown.scene !== scene) setShown({scene, prev: shown.scene, n: shown.n + 1});
    const look = SCENES[scene];
    return (
        <div className="pn-scene-stack" aria-hidden="true" data-pn-scene-layer={scene}>
            {shown.prev !== null && shown.prev !== scene && <div className="pn-scene" data-pn-scene={shown.prev}/>}
            <div key={shown.n} className={cn('pn-scene', shown.n > 0 && 'pn-scene-fade')} data-pn-scene={scene} data-pn-light={look.light ? '' : undefined}>
                <SceneArt art={look.art} ambient={look.ambient}/>
            </div>
        </div>
    );
};

export default SceneBackdrop;
