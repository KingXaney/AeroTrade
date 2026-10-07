import {useSyncExternalStore} from "react";
import {parseCssColor, type Rgb} from "@/lib/theme/css-color";

// What a three.js scene needs to know about the page it draws in — the landing terrain
// (components/landing/MomentumTerrain) and the brain's knowledge graph (components/brain/BrainGraph)
// share it. Everything here is an external store read through useSyncExternalStore, with a server
// snapshot, so the first client paint matches the server's and no decision sets state in an effect.

const THEME_ATTRIBUTES = ['data-palette', 'data-style', 'data-mode', 'data-motion'];

// The document's theme attributes as one string: a change means the tokens must be read again.
const subscribeHtml = (notify: () => void) => {
    const observer = new MutationObserver(notify);
    observer.observe(document.documentElement, {attributes: true, attributeFilter: THEME_ATTRIBUTES});
    return () => observer.disconnect();
};
const themeStamp = () => {
    const data = document.documentElement.dataset;
    return `${data.palette}|${data.style}|${data.mode}|${data.motion}`;
};
export const useThemeStamp = (): string => useSyncExternalStore(subscribeHtml, themeStamp, () => '');

const subscribeMedia = (query: string) => (notify: () => void) => {
    const media = window.matchMedia(query);
    media.addEventListener('change', notify);
    return () => media.removeEventListener('change', notify);
};
const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';
const COARSE_QUERY = '(pointer: coarse)';
const subscribeReduced = subscribeMedia(REDUCED_QUERY);
const subscribeCoarse = subscribeMedia(COARSE_QUERY);
// The OS setting only; the in-app toggle is the theme stamp's last field ('reduced').
export const useReducedMotion = (): boolean =>
    useSyncExternalStore(subscribeReduced, () => window.matchMedia(REDUCED_QUERY).matches, () => false);
export const useCoarsePointer = (): boolean =>
    useSyncExternalStore(subscribeCoarse, () => window.matchMedia(COARSE_QUERY).matches, () => false);

// Whether this browser draws WebGL at all.
export const supportsWebGL = (): boolean => {
    try {
        const probe = document.createElement('canvas');
        return Boolean(probe.getContext('webgl2') ?? probe.getContext('webgl'));
    } catch {
        return false;
    }
};
// Probed once; null on the server and while hydrating.
const subscribeNever = () => () => {};
let webglProbe: boolean | null = null;
const readWebGL = (): boolean => {
    if (webglProbe === null) webglProbe = supportsWebGL();
    return webglProbe;
};
export const useWebGL = (): boolean | null => useSyncExternalStore(subscribeNever, readWebGL, () => null);

const GREY: Rgb = [128, 128, 128];

// The document's colour tokens as RGB, so a scene that cannot read CSS variables still follows
// the theme (invariant 5: no hex in a component). A value that is not a colour falls back to grey.
export const readTokens = <K extends string>(tokens: Record<K, string>): Record<K, Rgb> => {
    const style = getComputedStyle(document.documentElement);
    const out = {} as Record<K, Rgb>;
    for (const key of Object.keys(tokens) as K[]) out[key] = parseCssColor(style.getPropertyValue(tokens[key])) ?? GREY;
    return out;
};
