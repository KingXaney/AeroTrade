'use client';

// The personal look's controls (lib/poker-night/personal): what a player sees and hears at the
// table, for their eyes only — the card back, the card face, a four-colour deck, the chip colours,
// then sound, vibration, the screen kept on, the hand's name, peek, muted emotes, the single-key
// shortcuts and "Let others ask to see my cards" (which the table also tells the room). Each picker draws real samples of the choice (a card back, two cards in each face,
// the four aces, a row of chip stacks) from LOOKS_CSS through the sample's own data attributes —
// a drawer is portaled out of the room that carries the viewer's. Controlled: the table's My look
// drawer keeps every change in this browser at once, the lobby's My look saves them with the account.

import {useId, type CSSProperties, type ReactNode} from "react";
import MicroLabel from "@/components/primitives/MicroLabel";
import Switch from "@/components/primitives/Switch";
import ChoiceGroup from "@/components/poker-night/ChoiceGroup";
import PlayingCard from "@/components/poker-night/PlayingCard";
import {LOOKS_COPY} from "@/lib/learn/copy/poker-night";
import type {Card} from "@/lib/poker/cards";
import {DENOMINATIONS} from "@/lib/poker-night/chips";
import {CARD_BACK_IDS, CARD_FACE_IDS, CHIP_SET_IDS, type CardBackId, type CardFaceId, type ChipSetId} from "@/lib/poker-night/looks";
import type {PersonalLook, PersonalSwitch} from "@/lib/poker-night/personal";

type Props = {
    look: PersonalLook;
    onChange: (patch: Partial<PersonalLook>) => void;
    disabled?: boolean;
};

// A card by rank (0 = two … 12 = ace) and suit (clubs, diamonds, hearts, spades), as lib/poker/cards
// numbers them.
const card = (rank: number, suit: number): Card => rank * 4 + suit;
const ACES: readonly Card[] = [card(12, 0), card(12, 1), card(12, 2), card(12, 3)];
const FACE_SAMPLE: readonly Card[] = [card(12, 3), card(11, 2)];

const width = (px: number) => ({'--pn-card-w': `${px}px`} as CSSProperties);

// The cards as the viewer would see them, in a choice's style.
const Sample = ({back, face = 'large', four, cards, w}: {back?: CardBackId; face?: CardFaceId; four: boolean; cards: readonly (Card | null)[]; w: number}) => (
    <span className="pn-sample" style={width(w)} data-pn-back={back} data-pn-face={face} data-pn-colours={four ? 'four' : 'two'} aria-hidden="true">
        {cards.map((c, i) => <PlayingCard key={i} card={c}/>)}
    </span>
);

// A short stack of every denomination, in a set's colours.
const ChipRow = ({set}: {set: ChipSetId}) => (
    <span className="pn-sample pn-chips gap-0.5" data-pn-chips={set} aria-hidden="true">
        {DENOMINATIONS.map((denom) => (
            <span key={denom} className="pn-chip-col">
                <span className="pn-chip rounded-full" data-denom={denom}/>
                <span className="pn-chip rounded-full" data-denom={denom}/>
                <span className="pn-chip rounded-full" data-denom={denom}/>
            </span>
        ))}
    </span>
);

const SWITCH_WORDS: Record<PersonalSwitch, {label: string; hint: string}> = {
    fourColour: {label: LOOKS_COPY.fourColour, hint: LOOKS_COPY.fourColourHint},
    sound: {label: LOOKS_COPY.sound, hint: LOOKS_COPY.soundHint},
    buzz: {label: LOOKS_COPY.buzz, hint: LOOKS_COPY.buzzHint},
    keepAwake: {label: LOOKS_COPY.keepAwake, hint: LOOKS_COPY.keepAwakeHint},
    handHints: {label: LOOKS_COPY.handHints, hint: LOOKS_COPY.handHintsHint},
    peek: {label: LOOKS_COPY.peek, hint: LOOKS_COPY.peekHint},
    muteEmotes: {label: LOOKS_COPY.muteEmotes, hint: LOOKS_COPY.muteEmotesHint},
    shortcuts: {label: LOOKS_COPY.shortcuts, hint: LOOKS_COPY.shortcutsHint},
    allowAsks: {label: LOOKS_COPY.allowAsks, hint: LOOKS_COPY.allowAsksHint},
};

// The switches below the pickers, in this order (the four-colour deck sits with the cards).
const SWITCHES: readonly PersonalSwitch[] = ['sound', 'buzz', 'keepAwake', 'handHints', 'peek', 'muteEmotes', 'shortcuts', 'allowAsks'];

const SwitchRow = ({id, which, look, onChange, disabled, sample}: {
    id: string; which: PersonalSwitch; look: PersonalLook; onChange: Props['onChange']; disabled: boolean; sample?: ReactNode;
}) => (
    <div className="flex min-h-11 items-start justify-between gap-4" data-pn-switch-row={which}>
        <div className="min-w-0 space-y-1">
            <label htmlFor={`${id}-${which}`} className="text-sm text-fg">{SWITCH_WORDS[which].label}</label>
            <p id={`${id}-${which}-hint`} className="text-[11px] leading-relaxed text-fg-muted">{SWITCH_WORDS[which].hint}</p>
            {sample}
        </div>
        <Switch id={`${id}-${which}`} checked={look[which]} disabled={disabled} aria-describedby={`${id}-${which}-hint`} className="mt-1 shrink-0"
                onCheckedChange={(on) => onChange({[which]: on})} data-pn-personal={which} {...(which === 'shortcuts' ? {'data-pn-shortcuts': ''} : {})}/>
    </div>
);

const PersonalLookControls = ({look, onChange, disabled = false}: Props) => {
    const id = useId();
    return (
        <div className="space-y-5" data-pn-personal-look="">
            <div className="space-y-1.5">
                <MicroLabel as="p">{LOOKS_COPY.cardBack}</MicroLabel>
                <ChoiceGroup<CardBackId>
                    label={LOOKS_COPY.cardBack}
                    ids={CARD_BACK_IDS}
                    value={look.cardBack}
                    onChange={(cardBack) => onChange({cardBack})}
                    name={(back) => LOOKS_COPY.backs[back]}
                    disabled={disabled}
                    className="grid grid-cols-[repeat(auto-fill,minmax(3rem,1fr))] gap-1.5"
                    optionClassName="py-1.5"
                    hook="card-back"
                    render={(back) => <Sample back={back} four={look.fourColour} cards={[null]} w={30}/>}
                />
            </div>

            <div className="space-y-1.5">
                <MicroLabel as="p">{LOOKS_COPY.cardFace}</MicroLabel>
                <ChoiceGroup<CardFaceId>
                    label={LOOKS_COPY.cardFace}
                    ids={CARD_FACE_IDS}
                    value={look.cardFace}
                    onChange={(cardFace) => onChange({cardFace})}
                    name={(face) => LOOKS_COPY.faces[face]}
                    disabled={disabled}
                    className="grid grid-cols-2 gap-2"
                    optionClassName="flex flex-col items-center gap-1.5 p-2"
                    hook="card-face"
                    render={(face) => (
                        <>
                            <Sample face={face} four={look.fourColour} cards={FACE_SAMPLE} w={40}/>
                            <span className="text-xs text-fg">{LOOKS_COPY.faces[face]}</span>
                            <span className="text-[11px] leading-snug text-fg-muted">{LOOKS_COPY.faceNotes[face]}</span>
                        </>
                    )}
                />
            </div>

            <SwitchRow id={id} which="fourColour" look={look} onChange={onChange} disabled={disabled}
                       sample={<span className="block pt-1"><Sample face={look.cardFace} four={look.fourColour} cards={ACES} w={30}/></span>}/>

            <div className="space-y-1.5">
                <MicroLabel as="p">{LOOKS_COPY.chipSet}</MicroLabel>
                <ChoiceGroup<ChipSetId>
                    label={LOOKS_COPY.chipSet}
                    ids={CHIP_SET_IDS}
                    value={look.chips}
                    onChange={(chips) => onChange({chips})}
                    name={(set) => LOOKS_COPY.chips[set]}
                    disabled={disabled}
                    className="grid grid-cols-2 gap-2"
                    optionClassName="flex flex-col items-center gap-1 p-2"
                    hook="chips"
                    render={(set) => (
                        <>
                            <ChipRow set={set}/>
                            <span className="text-xs text-fg-soft">{LOOKS_COPY.chips[set]}</span>
                        </>
                    )}
                />
            </div>

            <div className="space-y-3 border-t border-line-strong/15 pt-4">
                {SWITCHES.map((which) => <SwitchRow key={which} id={id} which={which} look={look} onChange={onChange} disabled={disabled}/>)}
            </div>
        </div>
    );
};

export default PersonalLookControls;
