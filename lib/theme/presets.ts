// Named palette × style combinations for the Settings cards. Presets are a
// convenience layer only — the independent pickers below them accept any pairing,
// so nothing else in the app keys off a preset id.

import type {PaletteId} from '@/lib/theme/palettes';
import type {StyleId} from '@/lib/theme/styles';

export type Preset = {
    id: string;
    label: string;
    palette: PaletteId;
    style: StyleId;
    description: string;
    isDefault?: boolean;
};

export const PRESETS: Preset[] = [
    {
        id: 'quiet-cyber',
        label: 'Quiet Cyber',
        palette: 'quiet-cyber',
        style: 'minimal',
        description: 'Dark and unboxed: hairline rules, one typeface, a cyan accent for links.',
        isDefault: true,
    },
    {
        id: 'neon-terminal',
        label: 'Neon Terminal',
        palette: 'quiet-cyber',
        style: 'futuristic',
        description: 'Cyan on black with glow, shimmer and particles.',
    },
    {
        id: 'liquid-cyber',
        label: 'Liquid Cyber',
        palette: 'quiet-cyber',
        style: 'liquid-glass',
        description: 'The default palette behind frosted glass.',
    },
    {
        id: 'dracula-glass',
        label: 'Dracula Glass',
        palette: 'dracula',
        style: 'liquid-glass',
        description: 'Dracula purple and mint through translucent panels.',
    },
    {
        id: 'nordic-frost',
        label: 'Nordic Frost',
        palette: 'nord',
        style: 'soft',
        description: 'Nord blues with rounded, softly shadowed cards.',
    },
    {
        id: 'paper',
        label: 'Paper',
        palette: 'paper',
        style: 'minimal',
        description: 'Warm light mode, unboxed, with teal accents.',
    },
    {
        id: 'arctic-glass',
        label: 'Arctic Glass',
        palette: 'arctic',
        style: 'liquid-glass',
        description: 'Cool light mode with frosted panels.',
    },
    {
        id: 'gruvbox-brutal',
        label: 'Gruvbox Brutal',
        palette: 'gruvbox-dark',
        style: 'brutalist',
        description: 'Retro browns, square corners and hard shadows.',
    },
    {
        id: 'tokyo-neon',
        label: 'Tokyo Neon',
        palette: 'tokyo-night',
        style: 'futuristic',
        description: 'Midnight navy with glowing blue and green.',
    },
    {
        id: 'mocha-soft',
        label: 'Mocha Soft',
        palette: 'catppuccin-mocha',
        style: 'soft',
        description: 'Catppuccin pastels on rounded, cushioned panels.',
    },
    {
        id: 'rose-glass',
        label: 'Rosé Glass',
        palette: 'rose-pine',
        style: 'liquid-glass',
        description: 'Rosé Pine plum and iris behind frosted glass.',
    },
    {
        id: 'solarized-terminal',
        label: 'Solarized Terminal',
        palette: 'solarized-dark',
        style: 'minimal',
        description: 'Solarized teal, unboxed and quiet.',
    },
];

export function findPreset(palette: PaletteId, style: StyleId): Preset | undefined {
    return PRESETS.find((preset) => preset.palette === palette && preset.style === style);
}
