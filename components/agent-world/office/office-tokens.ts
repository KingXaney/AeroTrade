// The office's colours, by the CSS custom property each is read from (app/globals.css `--office-*`,
// a material scale like the terrain's, and the theme's own brand, warning and line tokens for the
// lamps). The scene reads them at runtime through components/three/scene-env readTokens, never a
// literal in a component (invariant 5), and again whenever the theme repaints the page.

import type {Rgb} from "@/lib/theme/css-color";

export const OFFICE_TOKENS = {
    floor: '--office-floor',
    floorAlt: '--office-floor-alt',
    wall: '--office-wall',
    trim: '--office-wall-trim',
    glass: '--office-glass',
    wood: '--office-wood',
    woodTop: '--office-wood-top',
    chair: '--office-chair',
    metal: '--office-metal',
    brass: '--office-brass',
    screenOff: '--office-screen-off',
    screenGlow: '--office-screen-glow',
    paper: '--office-paper',
    cork: '--office-cork',
    plant: '--office-plant',
    shelf: '--office-shelf',
    robot: '--office-robot',
    robotDark: '--office-robot-dark',
    skin: '--office-skin',
    analysts: '--office-team-analysts',
    research: '--office-team-research',
    trading: '--office-team-trading',
    risk: '--office-team-risk',
    portfolio: '--office-team-portfolio',
    head: '--office-desk-head',
    execution: '--office-desk-execution',
    skyDay: '--office-sky-day',
    skyDayLow: '--office-sky-day-low',
    skyDusk: '--office-sky-dusk',
    skyDuskLow: '--office-sky-dusk-low',
    skyNight: '--office-sky-night',
    skyNightLow: '--office-sky-night-low',
    city: '--office-city',
    skyline: '--office-skyline',
    skylineWindow: '--office-skyline-window',
    brand: '--brand',
    warning: '--warning',
    idle: '--line-strong',
} as const;

export type OfficeTokenName = keyof typeof OFFICE_TOKENS;
export type OfficePalette = Record<OfficeTokenName, Rgb>;
