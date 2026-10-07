'use client';

// The table's look: a live preview of the scene with the felt in it, then the scenes (each a small
// room with its own art and the felt it opens with) and the felts (each a disc in its rail), as two
// radio groups (ChoiceGroup). Controlled and saving nothing itself: the host drawer's Look section
// sends each pick as the room's settings at once (everyone sees it), the lobby's My look keeps it
// as the account's default for new tables. Picking a scene picks the felt it opens with
// (lib/poker-night/looks scenePatch); any felt can go with it after. Every colour is LOOKS_CSS's,
// through the swatches' own data attributes.

import SceneArt from "@/components/poker-night/SceneArt";
import ChoiceGroup from "@/components/poker-night/ChoiceGroup";
import MicroLabel from "@/components/primitives/MicroLabel";
import {LOOKS_COPY} from "@/lib/learn/copy/poker-night";
import {LOOK_FELT_IDS, LOOK_SCENE_IDS, SCENES, type TableLook} from "@/lib/poker-night/looks";
import type {FeltId, SceneId} from "@/lib/poker-night/types";
import {cn} from "@/lib/utils";

type Props = {
    look: TableLook;
    onScene: (scene: SceneId) => void;
    onFelt: (felt: FeltId) => void;
    disabled?: boolean;
    preview?: boolean; // the big preview above the choices (off where the table itself shows behind)
};

// A small room: the scene's sky and art, the felt in the middle.
export const SceneSwatch = ({scene, felt, still = true, className}: {scene: SceneId; felt: FeltId; still?: boolean; className?: string}) => (
    <span className={cn('pn-swatch-scene block rounded-md', className)} data-pn-scene={scene} data-pn-felt={felt} aria-hidden="true">
        <SceneArt art={SCENES[scene].art} ambient={SCENES[scene].ambient} still={still}/>
        <span className="pn-mini-felt rounded-full"/>
    </span>
);

const LookPicker = ({look, onScene, onFelt, disabled = false, preview = true}: Props) => (
    <div className="space-y-4" data-pn-look-picker="">
        {preview && (
            <figure className="space-y-1.5">
                <SceneSwatch scene={look.scene} felt={look.felt} still={false} className="aspect-[16/9] w-full rounded-lg"/>
                <figcaption className="text-xs leading-snug" data-pn-look-preview={`${look.scene}:${look.felt}`}>
                    <span className="block text-fg-soft">{LOOKS_COPY.previewOf(LOOKS_COPY.scenes[look.scene], LOOKS_COPY.felts[look.felt])}</span>
                    <span className="block text-fg-muted">{LOOKS_COPY.sceneNotes[look.scene]}</span>
                </figcaption>
            </figure>
        )}
        <div className="space-y-1.5">
            <MicroLabel as="p">{LOOKS_COPY.scene}</MicroLabel>
            <ChoiceGroup<SceneId>
                label={LOOKS_COPY.scene}
                ids={LOOK_SCENE_IDS}
                value={look.scene}
                onChange={onScene}
                name={(id) => LOOKS_COPY.scenes[id]}
                disabled={disabled}
                className="grid grid-cols-2 gap-2 sm:grid-cols-4"
                optionClassName="flex flex-col items-stretch gap-1 p-1.5"
                hook="scene"
                render={(id) => (
                    <>
                        <SceneSwatch scene={id} felt={SCENES[id].felt} className="aspect-[16/10] w-full"/>
                        <span className="truncate text-[11px] leading-tight text-fg-soft">{LOOKS_COPY.scenes[id]}</span>
                    </>
                )}
            />
        </div>
        <div className="space-y-1.5">
            <MicroLabel as="p">{LOOKS_COPY.felt}</MicroLabel>
            <ChoiceGroup<FeltId>
                label={LOOKS_COPY.felt}
                ids={LOOK_FELT_IDS}
                value={look.felt}
                onChange={onFelt}
                name={(id) => LOOKS_COPY.felts[id]}
                disabled={disabled}
                className="flex flex-wrap gap-1.5"
                hook="felt"
                render={(id) => <span className="pn-felt-swatch block size-8 rounded-full" data-pn-felt={id} aria-hidden="true"/>}
            />
            <p className="text-[11px] leading-relaxed text-fg-muted">{LOOKS_COPY.sceneFelt}</p>
        </div>
    </div>
);

export default LookPicker;
