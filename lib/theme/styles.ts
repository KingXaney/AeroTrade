// The "style" axis: surface treatment, radius, effects and fonts. The CSS for each
// style — minimal included — is hand-written in app/globals.css under [data-style="…"]; this registry
// only owns the ids (whitelist for the cookie and <html> attribute) and the labels
// the Settings page shows. Palettes never touch these, so any palette × any style
// is a valid combination.

export const STYLE_IDS = ['minimal', 'futuristic', 'liquid-glass', 'brutalist', 'soft'] as const;

export type StyleId = (typeof STYLE_IDS)[number];

type StyleFonts = {display: string; body: string; mono: string};

export type Style = {
    id: StyleId;
    label: string;
    description: string;
    // Human-readable family names for the preset cards, not CSS variables.
    fonts: StyleFonts;
};

export const STYLES: Record<StyleId, Style> = {
    minimal: {
        id: 'minimal',
        label: 'Minimal',
        description: 'As little as possible: no boxes, a thin chrome, one typeface, ink buttons, ruled sections.',
        fonts: {display: 'Inter', body: 'Inter', mono: 'JetBrains Mono'},
    },
    futuristic: {
        id: 'futuristic',
        label: 'Futuristic',
        description: 'A console: the sections docked along the bottom, bracketed panels, mono capitals, denser type, glow and a particle grid.',
        fonts: {display: 'Space Grotesk', body: 'Hanken Grotesk', mono: 'JetBrains Mono'},
    },
    'liquid-glass': {
        id: 'liquid-glass',
        label: 'Liquid Glass',
        description: 'Floating islands: an inset glass bar, a capsule of icons at the left, pill controls, blur and drifting colour behind.',
        fonts: {display: 'Sora', body: 'Inter', mono: 'JetBrains Mono'},
    },
    brutalist: {
        id: 'brutalist',
        label: 'Brutalist',
        description: 'A ledger: a labelled sidebar, a stamped title, square everything, thick rules, hard shadows, mono capitals.',
        fonts: {display: 'IBM Plex Mono', body: 'Inter', mono: 'IBM Plex Mono'},
    },
    soft: {
        id: 'soft',
        label: 'Soft',
        description: 'A reading column: larger type centred at a comfortable width, rounded tiles and pills, layered shadows, a soft wash behind.',
        fonts: {display: 'Sora', body: 'Inter', mono: 'JetBrains Mono'},
    },
};

export function isStyleId(value: unknown): value is StyleId {
    return typeof value === 'string' && (STYLE_IDS as readonly string[]).includes(value);
}
