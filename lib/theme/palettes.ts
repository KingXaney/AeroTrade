// The "palette" axis: every colour token for every palette, in one registry that is
// the single source of truth. buildPaletteCss() renders it into the <style> the
// root layout emits, the Settings cards paint their swatches from it, and the
// contrast suite checks it — so a colour can only ever be changed here.
//
// Nothing user-supplied is ever interpolated into the CSS: ids are whitelisted
// through resolve.ts before they reach an <html> attribute, and the values below
// are literals.

export const PALETTE_IDS = [
    'quiet-cyber',
    'dracula',
    'nord',
    'tokyo-night',
    'catppuccin-mocha',
    'gruvbox-dark',
    'one-dark',
    'solarized-dark',
    'monokai',
    'rose-pine',
    'paper',
    'arctic',
] as const;

export type PaletteId = (typeof PALETTE_IDS)[number];

export type PaletteMode = 'dark' | 'light';

export type PaletteTokens = {
    bg: string;
    chrome: string;
    surface0: string;
    surface1: string;
    surface2: string;
    surface3: string;
    surface4: string;
    fg: string;
    fgSoft: string;
    fgMuted: string;
    // The one non-hex token: a translucent hairline, so it has to be an rgba() that
    // carries the palette's foreground tint rather than a flat grey.
    line: string;
    lineStrong: string;
    brand: string;
    brandStrong: string;
    brandDim: string;
    onBrand: string;
    positive: string;
    negative: string;
    onNegative: string;
    // Caution, not loss: stale prices, a closed market, a degraded job. Taken from each
    // theme's own canonical yellow/orange rather than derived — gruvbox's brand is already
    // #fabd2f, so any brand-derived yellow would vanish into the accent. Foreground/tint
    // only (text-warning, bg-warning/10); add onWarning if a filled amber surface is ever
    // needed, with 12 more hand-picked values.
    warning: string;
    secondaryTint: string;
};

export type PaletteToken = keyof PaletteTokens;

export type Palette = {
    id: PaletteId;
    label: string;
    description: string;
    mode: PaletteMode;
    // [bg, brand, positive] — what a preset card paints.
    swatch: [string, string, string];
    tokens: PaletteTokens;
};

// Semantic names deliberately avoid shadcn's (--accent, --border, --secondary…),
// which components/ui/* already own.
export const CSS_VAR_BY_TOKEN: Record<PaletteToken, string> = {
    bg: '--bg',
    chrome: '--chrome',
    surface0: '--surface-0',
    surface1: '--surface-1',
    surface2: '--surface-2',
    surface3: '--surface-3',
    surface4: '--surface-4',
    fg: '--fg',
    fgSoft: '--fg-soft',
    fgMuted: '--fg-muted',
    line: '--line',
    lineStrong: '--line-strong',
    brand: '--brand',
    brandStrong: '--brand-strong',
    brandDim: '--brand-dim',
    onBrand: '--on-brand',
    positive: '--positive',
    negative: '--negative',
    onNegative: '--on-negative',
    warning: '--warning',
    secondaryTint: '--secondary-tint',
};

export const PALETTE_TOKEN_KEYS = Object.keys(CSS_VAR_BY_TOKEN) as PaletteToken[];

// The swatch is derived rather than written per palette so it cannot drift from the
// tokens it previews.
function definePalette(
    id: PaletteId,
    label: string,
    description: string,
    mode: PaletteMode,
    tokens: PaletteTokens,
): Palette {
    return {id, label, description, mode, swatch: [tokens.bg, tokens.brand, tokens.positive], tokens};
}

// `chrome` is surface0 darkened by 2% lightness (HSL) for dark palettes and equal to
// surface0 for light ones; quiet-cyber keeps today's literal for pixel parity.
export const PALETTES: Record<PaletteId, Palette> = {
    'quiet-cyber': definePalette(
        'quiet-cyber',
        'Quiet Cyber',
        'Near-black panels with a cool cyan accent. The default.',
        'dark',
        {
            bg: '#050608',
            chrome: '#0d1014',
            surface0: '#111318',
            surface1: '#14171b',
            surface2: '#1e2024',
            surface3: '#282a2e',
            surface4: '#333539',
            fg: '#e2e2e8',
            fgSoft: '#b9cacb',
            fgMuted: '#849495',
            line: 'rgba(255,255,255,.06)',
            lineStrong: '#3b494b',
            brand: '#7df4ff',
            brandStrong: '#00f0ff',
            brandDim: '#00dbe9',
            onBrand: '#002022',
            // Gains share the accent here; every other palette gives them their own green.
            positive: '#7df4ff',
            negative: '#ffb4ab',
            onNegative: '#690005',
            warning: '#ffd166',
            secondaryTint: '#7000ff',
        },
    ),
    dracula: definePalette(
        'dracula',
        'Dracula',
        'Deep indigo greys with the classic purple, mint and pink.',
        'dark',
        {
            bg: '#21222c',
            chrome: '#242530',
            surface0: '#282a36',
            surface1: '#2c2e3b',
            surface2: '#343746',
            surface3: '#44475a',
            surface4: '#4d5066',
            fg: '#f8f8f2',
            fgSoft: '#c9cbd6',
            fgMuted: '#7f88b4',
            line: 'rgba(248,248,242,.07)',
            lineStrong: '#545871',
            brand: '#bd93f9',
            brandStrong: '#d0b0ff',
            brandDim: '#a77cf0',
            onBrand: '#282a36',
            positive: '#50fa7b',
            negative: '#ff5555',
            onNegative: '#2b0a0a',
            warning: '#ffb86c',
            secondaryTint: '#ff79c6',
        },
    ),
    nord: definePalette(
        'nord',
        'Nord',
        'Arctic blue-greys with frost cyan and a muted green.',
        'dark',
        {
            bg: '#2e3440',
            chrome: '#2f3441',
            surface0: '#333947',
            surface1: '#3b4252',
            surface2: '#434c5e',
            surface3: '#4c566a',
            surface4: '#566179',
            fg: '#eceff4',
            fgSoft: '#d8dee9',
            fgMuted: '#9aa5b8',
            line: 'rgba(236,239,244,.08)',
            lineStrong: '#5c6a82',
            brand: '#88c0d0',
            brandStrong: '#a3d4e2',
            brandDim: '#79aebe',
            onBrand: '#2e3440',
            positive: '#a3be8c',
            negative: '#d2777f',
            onNegative: '#140a0c',
            warning: '#ebcb8b',
            secondaryTint: '#b48ead',
        },
    ),
    'tokyo-night': definePalette(
        'tokyo-night',
        'Tokyo Night',
        'Midnight navy with electric blue and neon green.',
        'dark',
        {
            bg: '#1a1b26',
            chrome: '#1b1c2a',
            surface0: '#1f2030',
            surface1: '#24283b',
            surface2: '#292e42',
            surface3: '#2f3549',
            surface4: '#3b4261',
            fg: '#c0caf5',
            fgSoft: '#a9b1d6',
            fgMuted: '#737aa2',
            line: 'rgba(192,202,245,.06)',
            lineStrong: '#414868',
            brand: '#7aa2f7',
            brandStrong: '#7dcfff',
            brandDim: '#5d84d9',
            onBrand: '#1a1b26',
            positive: '#9ece6a',
            negative: '#f7768e',
            onNegative: '#2a0b12',
            warning: '#e0af68',
            secondaryTint: '#bb9af7',
        },
    ),
    'catppuccin-mocha': definePalette(
        'catppuccin-mocha',
        'Catppuccin Mocha',
        'Soft pastel accents on a warm, very dark base.',
        'dark',
        {
            bg: '#11111b',
            chrome: '#14141f',
            surface0: '#181825',
            surface1: '#1e1e2e',
            surface2: '#313244',
            surface3: '#45475a',
            surface4: '#585b70',
            fg: '#cdd6f4',
            fgSoft: '#bac2de',
            fgMuted: '#9399b2',
            line: 'rgba(205,214,244,.06)',
            lineStrong: '#6c7086',
            brand: '#89b4fa',
            brandStrong: '#a5c8ff',
            brandDim: '#6f9ee6',
            onBrand: '#11111b',
            positive: '#a6e3a1',
            negative: '#f38ba8',
            onNegative: '#11111b',
            warning: '#f9e2af',
            secondaryTint: '#cba6f7',
        },
    ),
    'gruvbox-dark': definePalette(
        'gruvbox-dark',
        'Gruvbox Dark',
        'Retro warm browns with mustard yellow and olive.',
        'dark',
        {
            bg: '#1d2021',
            chrome: '#232323',
            surface0: '#282828',
            surface1: '#32302f',
            surface2: '#3c3836',
            surface3: '#504945',
            surface4: '#665c54',
            fg: '#ebdbb2',
            fgSoft: '#d5c4a1',
            fgMuted: '#a89984',
            line: 'rgba(235,219,178,.08)',
            lineStrong: '#7c6f64',
            brand: '#fabd2f',
            brandStrong: '#fdd35a',
            brandDim: '#d79921',
            onBrand: '#1d2021',
            positive: '#b8bb26',
            negative: '#fb4934',
            onNegative: '#1d2021',
            warning: '#fe8019',
            secondaryTint: '#d3869b',
        },
    ),
    'one-dark': definePalette(
        'one-dark',
        'One Dark',
        'Balanced blue-grey with sky blue and sage.',
        'dark',
        {
            bg: '#21252b',
            chrome: '#24272e',
            surface0: '#282c34',
            surface1: '#2c313a',
            surface2: '#333842',
            surface3: '#3e4451',
            surface4: '#4b5263',
            fg: '#dcdfe4',
            fgSoft: '#abb2bf',
            fgMuted: '#7f848e',
            line: 'rgba(220,223,228,.06)',
            lineStrong: '#5c6370',
            brand: '#61afef',
            brandStrong: '#7cc0ff',
            brandDim: '#4d9be0',
            onBrand: '#21252b',
            positive: '#98c379',
            negative: '#e06c75',
            onNegative: '#21252b',
            warning: '#e5c07b',
            secondaryTint: '#c678dd',
        },
    ),
    'solarized-dark': definePalette(
        'solarized-dark',
        'Solarized Dark',
        'Deep teal with Solarized blue and ochre-green.',
        'dark',
        {
            bg: '#002b36',
            chrome: '#032a34',
            surface0: '#04323e',
            surface1: '#073642',
            surface2: '#0d404d',
            surface3: '#134a57',
            surface4: '#1c5563',
            fg: '#eee8d5',
            fgSoft: '#93a1a1',
            fgMuted: '#839496',
            line: 'rgba(147,161,161,.10)',
            lineStrong: '#586e75',
            brand: '#268bd2',
            brandStrong: '#3aa0e8',
            brandDim: '#1f78b8',
            onBrand: '#00141a',
            positive: '#859900',
            negative: '#e5534b',
            onNegative: '#140505',
            // Solarized's literal #b58900 only reaches 4.05 on its own surface1; lightened.
            warning: '#d2a520',
            secondaryTint: '#6c71c4',
        },
    ),
    monokai: definePalette(
        'monokai',
        'Monokai',
        'Charcoal with cyan, lime and hot pink.',
        'dark',
        {
            bg: '#1e1f1c',
            chrome: '#22221d',
            surface0: '#272822',
            surface1: '#2d2e27',
            surface2: '#35362e',
            surface3: '#3e3d32',
            surface4: '#49483e',
            fg: '#f8f8f2',
            fgSoft: '#cfcfc2',
            fgMuted: '#908c78',
            line: 'rgba(248,248,242,.07)',
            lineStrong: '#75715e',
            brand: '#66d9ef',
            brandStrong: '#8ae6f7',
            brandDim: '#4fc1d8',
            onBrand: '#1e1f1c',
            positive: '#a6e22e',
            negative: '#f92672',
            onNegative: '#14060b',
            warning: '#fd971f',
            secondaryTint: '#ae81ff',
        },
    ),
    'rose-pine': definePalette(
        'rose-pine',
        'Rosé Pine',
        'Muted plum with iris purple and foam teal.',
        'dark',
        {
            bg: '#191724',
            chrome: '#1b1928',
            surface0: '#1f1d2e',
            surface1: '#26233a',
            surface2: '#2a273f',
            surface3: '#403d52',
            surface4: '#524f67',
            fg: '#e0def4',
            fgSoft: '#b4b1cb',
            fgMuted: '#908caa',
            line: 'rgba(224,222,244,.06)',
            lineStrong: '#6e6a86',
            brand: '#c4a7e7',
            brandStrong: '#d6c0f2',
            brandDim: '#a98bd0',
            onBrand: '#191724',
            // Rosé Pine has no green, so gains use foam.
            positive: '#9ccfd8',
            negative: '#eb6f92',
            onNegative: '#2a0f1a',
            // Rosé Pine has exactly one warm colour, so warning == secondaryTint here.
            warning: '#f6c177',
            secondaryTint: '#f6c177',
        },
    ),
    paper: definePalette(
        'paper',
        'Paper',
        'Warm off-white with deep teal. Light.',
        'light',
        {
            bg: '#f4f1ea',
            chrome: '#ffffff',
            surface0: '#ffffff',
            surface1: '#fbfaf7',
            surface2: '#f3f1ec',
            surface3: '#ebe8e1',
            surface4: '#e2ded5',
            fg: '#1c1a17',
            fgSoft: '#4a463f',
            fgMuted: '#7a7468',
            line: 'rgba(28,26,23,.08)',
            lineStrong: '#cfc9bd',
            brand: '#0f766e',
            brandStrong: '#0d9488',
            brandDim: '#115e59',
            onBrand: '#ffffff',
            positive: '#1a7f37',
            negative: '#b42318',
            onNegative: '#ffffff',
            warning: '#854d0e',
            secondaryTint: '#6d4c9f',
        },
    ),
    arctic: definePalette(
        'arctic',
        'Arctic',
        'Cool white and slate with cyan. Light.',
        'light',
        {
            bg: '#eef2f7',
            chrome: '#ffffff',
            surface0: '#ffffff',
            surface1: '#f9fbfd',
            surface2: '#f1f5f9',
            surface3: '#e6ecf2',
            surface4: '#d9e1ea',
            fg: '#0f172a',
            fgSoft: '#334155',
            fgMuted: '#64748b',
            line: 'rgba(15,23,42,.08)',
            lineStrong: '#cbd5e1',
            brand: '#0e7490',
            brandStrong: '#0891b2',
            brandDim: '#155e75',
            onBrand: '#ffffff',
            positive: '#15803d',
            negative: '#b91c1c',
            onNegative: '#ffffff',
            warning: '#854d0e',
            secondaryTint: '#6d28d9',
        },
    ),
};

export function modeOf(paletteId: PaletteId): PaletteMode {
    return PALETTES[paletteId].mode;
}

// The `html` type selector gives (0,1,1) specificity, so these blocks beat the :root
// defaults in globals.css regardless of stylesheet order.
function paletteBlock(palette: Palette): string {
    const declarations = PALETTE_TOKEN_KEYS.map((key) => `${CSS_VAR_BY_TOKEN[key]}:${palette.tokens[key]}`).join(';');
    return `html[data-palette="${palette.id}"]{${declarations}}`;
}

export function buildPaletteCss(): string {
    return PALETTE_IDS.map((id) => paletteBlock(PALETTES[id])).join('\n');
}

// Built once at module load; the layout renders this constant, never user input.
export const PALETTE_CSS = buildPaletteCss();
