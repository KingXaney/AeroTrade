'use client';

// The avatar builder: a big live preview of the look, a dice "Roll" for a random one, and the look's
// four parts — face, colour, frame, badge — one at a time behind a row of tabs, each a grid of
// choices drawn as the look itself would be with that one part changed (so the faces show on the
// chosen colour, the frames round the chosen face) — except the badges, drawn large on their own,
// since one at a disc's shoulder is too small to tell apart on a phone (the preview above shows it
// worn). Controlled: it holds no look of its own, hands
// every change up as the encoded string (lib/poker-night/avatar withPart, rollAvatar) and saves
// nothing — the table's My look drawer sends it with the room's 'profile' action, the join card
// keeps it in this browser, the lobby saves it with the account. Rolling happens in the click
// handler, never in render.

import {useId, useState} from "react";
import {Dices} from "lucide-react";
import ActionButton from "@/components/primitives/ActionButton";
import AvatarDisc from "@/components/poker-night/AvatarDisc";
import ChoiceGroup from "@/components/poker-night/ChoiceGroup";
import {AVATAR_COPY, JOIN_COPY} from "@/lib/learn/copy/poker-night";
import {AVATAR_PARTS, badgeGlyph, encodeAvatar, PART_IDS, resolveAvatar, rollAvatar, withPart, type AvatarPart, type AvatarSpec} from "@/lib/poker-night/avatar";
import {cn} from "@/lib/utils";

type Props = {
    value: string;
    onChange: (avatar: string) => void;
    disabled?: boolean;
    compact?: boolean; // a smaller preview, for the join card
};

// The name of a part's choice, for its button.
const nameOf = (part: AvatarPart, id: string): string => {
    switch (part) {
        case 'face': return AVATAR_COPY.faces[id as AvatarSpec['face']];
        case 'colour': return AVATAR_COPY.colours[id as AvatarSpec['colour']];
        case 'frame': return AVATAR_COPY.frames[id as AvatarSpec['frame']];
        case 'badge': return AVATAR_COPY.badges[id as AvatarSpec['badge']];
    }
};

// Each part's grid: the faces dense, the rest roomier (a frame needs room round its disc).
const GRID: Record<AvatarPart, string> = {
    face: 'grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1',
    colour: 'grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1',
    frame: 'grid grid-cols-[repeat(auto-fill,minmax(3.5rem,1fr))] gap-2',
    badge: 'grid grid-cols-[repeat(auto-fill,minmax(3.25rem,1fr))] gap-1.5',
};

// A badge as its choice shows it: the glyph alone, large; "none" an empty dashed ring.
const BadgeChoice = ({badge}: {badge: AvatarSpec['badge']}) => {
    const glyph = badgeGlyph(badge);
    return glyph
        ? <span aria-hidden="true" className="text-[26px] leading-none" data-pn-badge-glyph="">{glyph}</span>
        : <span aria-hidden="true" className="size-7 rounded-full border-2 border-dashed border-line-strong/40"/>;
};

const AvatarBuilder = ({value, onChange, disabled = false, compact = false}: Props) => {
    const id = useId();
    const [part, setPart] = useState<AvatarPart>('face');
    const spec = resolveAvatar(value);
    const encoded = encodeAvatar(spec);
    const [rolls, setRolls] = useState(0);

    // A choice drawn as the look with that one part changed; a face on its own colour, plainly.
    const sample = (p: AvatarPart, choice: string): string =>
        p === 'face' ? encodeAvatar({...spec, face: choice as AvatarSpec['face'], frame: 'none', badge: 'none'}) : withPart(encoded, p, choice);

    return (
        <div className="space-y-3" data-pn-builder="">
            <div className="flex items-center gap-4">
                <div className={cn('grid shrink-0 place-items-center', compact ? 'size-20' : 'size-24')}>
                    {/* Re-keyed on every change, so the preview pops (a mechanic: the guards show it at once). */}
                    <AvatarDisc key={`${encoded}-${rolls}`} avatar={encoded} size={compact ? 64 : 80} className="pn-seat-in"
                                label={JOIN_COPY.lookLabel(AVATAR_COPY.describe(spec))}/>
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                    <p className="text-xs leading-snug text-fg-soft" aria-live="polite" data-pn-look-words="">{AVATAR_COPY.describe(spec)}</p>
                    <ActionButton variant="secondary" size="md" className="inline-flex min-h-11 items-center gap-2" disabled={disabled}
                                  aria-label={AVATAR_COPY.rollLabel} data-roll-look=""
                                  onClick={() => {
                                      onChange(encodeAvatar(rollAvatar(Math.random)));
                                      setRolls((n) => n + 1);
                                  }}>
                        <Dices className="size-4" aria-hidden="true"/>
                        {AVATAR_COPY.roll}
                    </ActionButton>
                </div>
            </div>

            <div role="tablist" aria-label={AVATAR_COPY.builder} className="grid grid-cols-4 gap-1 rounded-lg bg-surface-2/60 p-1">
                {AVATAR_PARTS.map((p) => {
                    const on = p === part;
                    return (
                        <button key={p} type="button" role="tab" id={`${id}-tab-${p}`} aria-selected={on} aria-controls={`${id}-panel`} tabIndex={on ? 0 : -1}
                                className={cn('control-type min-h-11 rounded-md px-1 text-xs transition-colors',
                                    on ? 'bg-brand text-on-brand' : 'text-fg-soft hover:bg-surface-3 hover:text-fg')}
                                onClick={() => setPart(p)}
                                onKeyDown={(e) => {
                                    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                                    e.preventDefault();
                                    const next = AVATAR_PARTS[(AVATAR_PARTS.indexOf(p) + (e.key === 'ArrowRight' ? 1 : AVATAR_PARTS.length - 1)) % AVATAR_PARTS.length];
                                    setPart(next);
                                    document.getElementById(`${id}-tab-${next}`)?.focus();
                                }}
                                data-pn-builder-tab={p}>
                            {AVATAR_COPY.parts[p]}
                        </button>
                    );
                })}
            </div>

            <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${part}`} className={cn('overflow-y-auto overscroll-contain p-1', compact ? 'max-h-44' : 'max-h-72')}>
                <ChoiceGroup<string>
                    key={part}
                    label={AVATAR_COPY.parts[part]}
                    ids={PART_IDS[part]}
                    value={spec[part]}
                    onChange={(choice) => onChange(withPart(encoded, part, choice))}
                    name={(choice) => nameOf(part, choice)}
                    disabled={disabled}
                    className={GRID[part]}
                    optionClassName={part === 'frame' ? 'min-h-14' : undefined}
                    hook={`avatar-${part}`}
                    render={(choice) => (part === 'badge'
                        ? <BadgeChoice badge={choice as AvatarSpec['badge']}/>
                        : <AvatarDisc avatar={sample(part, choice)} size={part === 'face' ? 34 : 36} decorative/>)}
                />
            </div>
        </div>
    );
};

export default AvatarBuilder;
