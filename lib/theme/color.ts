// Colour math shared by the palette registry, its contrast tests and the canvas
// consumers that need rgb() rather than hex. Dependency-free so the unit tests
// never pull in React or the database.

export type Rgb = {r: number; g: number; b: number};

const HEX6 = /^#[0-9a-f]{6}$/i;

export function isHex6(value: unknown): value is string {
    return typeof value === 'string' && HEX6.test(value);
}

export function hexToRgb(hex: string): Rgb {
    if (!isHex6(hex)) {
        // Only registry values reach this, so a miss is a programming error, not input.
        throw new Error(`Expected a 6-digit hex colour, got ${JSON.stringify(hex)}`);
    }
    return {
        r: parseInt(hex.slice(1, 3), 16),
        g: parseInt(hex.slice(3, 5), 16),
        b: parseInt(hex.slice(5, 7), 16),
    };
}

// WCAG 2.2 sRGB linearisation. 2.0 used 0.03928 as the cutoff; the difference in
// the resulting ratio is below 0.001 and 2.2 is the current text.
function linearise(channel: number): number {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
    const {r, g, b} = hexToRgb(hex);
    return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b);
}

// Symmetric: the lighter colour always goes on top, so argument order is irrelevant.
export function contrastRatio(hexA: string, hexB: string): number {
    const a = relativeLuminance(hexA);
    const b = relativeLuminance(hexB);
    const [light, dark] = a >= b ? [a, b] : [b, a];
    return (light + 0.05) / (dark + 0.05);
}
