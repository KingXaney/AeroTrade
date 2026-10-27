// The office's single-key shortcuts, pure: which key does what. The page listens only while the
// focus is on the floor or the seats' roster, never with ⌘, Ctrl or Alt held, never on a repeat and
// never in a field or an open dialog; a focused button's Enter and Space stay the button's own.

import {OFFICE_PRESET_IDS, type OfficePresetId} from "@/lib/agent-world/office-layout";

export type OfficeIntent =
    | {type: 'preset'; preset: OfficePresetId}
    | {type: 'follow'}
    | {type: 'zoom'; factor: number}
    | {type: 'step'; by: 1 | -1}
    | {type: 'replay'}
    | {type: 'plan'}
    | {type: 'sound'}
    | {type: 'clear'};

export type KeyLike = {key: string; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean; repeat?: boolean};

export const ZOOM_IN = 0.8;
export const ZOOM_OUT = 1.25;

export const officeIntentForKey = (event: KeyLike): OfficeIntent | null => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return null;
    const key = event.key;
    if (/^[0-7]$/.test(key)) return {type: 'preset', preset: OFFICE_PRESET_IDS[Number(key)]};
    switch (key.toLowerCase()) {
        case 'f': return {type: 'follow'};
        case '+':
        case '=': return {type: 'zoom', factor: ZOOM_IN};
        case '-':
        case '_': return {type: 'zoom', factor: ZOOM_OUT};
        case '[': return {type: 'step', by: -1};
        case ']': return {type: 'step', by: 1};
        case 'r': return {type: 'replay'};
        case 'p': return {type: 'plan'};
        case 'm': return {type: 'sound'};
        case 'escape': return {type: 'clear'};
        default: return null;
    }
};

// aria-keyshortcuts for the controls the keys mirror.
export const OFFICE_KEY_SHORTCUTS = {
    follow: 'F',
    zoomIn: '+',
    zoomOut: '-',
    replay: 'R',
    plan: 'P',
    sound: 'M',
    preset: (preset: OfficePresetId): string => String(OFFICE_PRESET_IDS.indexOf(preset)),
} as const;
