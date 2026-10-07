// A computed CSS custom property as a colour. Pure and import-free; what a three.js scene (the
// landing terrain, the brain's graph) reads the theme's tokens through, since a shader cannot read
// a CSS variable. lib/theme/color.ts keeps the palette registry's own hex helpers.

export type Rgb = readonly [number, number, number];

// '#rgb', '#rrggbb', 'rgb(r, g, b)' or 'rgba(r, g, b, a)' (the alpha is dropped). Anything else —
// a color-mix(), an empty string — is null, so a caller falls back.
export const parseCssColor = (text: string): Rgb | null => {
    const value = text.trim();
    const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
    if (hex) {
        const digits = hex[1].length === 3 ? hex[1].split('').map((c) => c + c).join('') : hex[1];
        return [parseInt(digits.slice(0, 2), 16), parseInt(digits.slice(2, 4), 16), parseInt(digits.slice(4, 6), 16)];
    }
    const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*[\d.]+\s*)?\)$/i.exec(value);
    if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
    return null;
};
