// The "style" axis: surface treatment, radius, effects and fonts. The CSS for each
// style is hand-written in app/globals.css under [data-style="…"]; this registry
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
        description: 'Flat panels, hairline borders, no effects. The original look.',
        fonts: {display: 'Sora', body: 'Hanken Grotesk', mono: 'JetBrains Mono'},
    },
    futuristic: {
        id: 'futuristic',
        label: 'Futuristic',
        description: 'Accent-tinted borders, glow, shimmer and a particle backdrop.',
        fonts: {display: 'Space Grotesk', body: 'Hanken Grotesk', mono: 'JetBrains Mono'},
    },
    'liquid-glass': {
        id: 'liquid-glass',
        label: 'Liquid Glass',
        description: 'Translucent blurred panels over slow-drifting colour blobs.',
        fonts: {display: 'Sora', body: 'Inter', mono: 'JetBrains Mono'},
    },
    brutalist: {
        id: 'brutalist',
        label: 'Brutalist',
        description: 'Square corners, thick borders, hard offset shadows, monospace headings.',
        fonts: {display: 'IBM Plex Mono', body: 'Inter', mono: 'IBM Plex Mono'},
    },
    soft: {
        id: 'soft',
        label: 'Soft',
        description: 'Rounded panels with layered soft shadows and low-contrast borders.',
        fonts: {display: 'Sora', body: 'Inter', mono: 'JetBrains Mono'},
    },
};

export function isStyleId(value: unknown): value is StyleId {
    return typeof value === 'string' && (STYLE_IDS as readonly string[]).includes(value);
}
