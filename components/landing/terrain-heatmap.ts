import type {MomentumSurface} from "@/lib/landing/momentum-surface";
import {heatmapPixels, type TerrainScale} from "@/lib/landing/terrain-view";

// Paints the grid onto a canvas, one pixel per cell, sized to the grid: the three.js scene
// wraps it as the floor's texture (nearest filtering keeps the cells crisp), and a browser with
// no WebGL shows it scaled up as the terrain's flat twin. False when the canvas gives no context.
export const paintHeatmap = (canvas: HTMLCanvasElement, surface: MomentumSurface, scale: TerrainScale): boolean => {
    const width = surface.dates.length;
    const height = surface.lookbacks.length;
    if (width === 0 || height === 0) return false;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return false;
    const image = context.createImageData(width, height);
    image.data.set(heatmapPixels(surface, scale));
    context.putImageData(image, 0, 0);
    return true;
};

// Whether this browser can draw the 3D scene at all.
export const supportsWebGL = (): boolean => {
    try {
        const probe = document.createElement('canvas');
        return Boolean(probe.getContext('webgl2') ?? probe.getContext('webgl'));
    } catch {
        return false;
    }
};
