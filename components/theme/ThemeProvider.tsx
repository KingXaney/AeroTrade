'use client';

import {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition, type ReactNode} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {PALETTES, type PaletteMode} from "@/lib/theme/palettes";
import {modeOfTheme, themeEquals, type Theme} from "@/lib/theme/resolve";
import {setAppearance} from "@/lib/actions/appearance.actions";

// Hover intent: a card the pointer merely sweeps over never repaints the document.
const PREVIEW_DELAY_MS = 60;
// Crossing the gutter between two cards must never flash the committed theme in between.
const CANCEL_DELAY_MS = 150;

export type ThemeTokens = {
    mode: PaletteMode;
    surface0: string;
    brand: string;
    positive: string;
    negative: string;
    fgMuted: string;
    reduceMotion: boolean;
};

type ThemeContextValue = {
    theme: Theme;              // the committed theme (what the server rendered)
    mode: PaletteMode;
    tokens: ThemeTokens;
    pending: boolean;
    preview: (theme: Theme) => void;
    commit: (theme: Theme) => void;
    cancel: (delayMs?: number) => void;   // 0 = restore right now
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

// Attributes live on <html> so portals (dialogs, dropdowns, chat, toasts) inherit them.
const applyToDocument = (theme: Theme) => {
    const el = document.documentElement;
    const mode = modeOfTheme(theme);
    el.dataset.palette = theme.palette;
    el.dataset.style = theme.style;
    el.dataset.mode = mode;
    el.dataset.motion = theme.reduceMotion ? 'reduced' : 'auto';
    el.classList.toggle('dark', mode === 'dark');
    el.style.colorScheme = mode;
};

const tokensFor = (theme: Theme): ThemeTokens => {
    const t = PALETTES[theme.palette].tokens;
    return {
        mode: modeOfTheme(theme),
        surface0: t.surface0,
        brand: t.brand,
        positive: t.positive,
        negative: t.negative,
        fgMuted: t.fgMuted,
        reduceMotion: theme.reduceMotion,
    };
};

const ThemeProvider = ({initial, children}: {initial: Theme; children: ReactNode}) => {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [committed, setCommitted] = useState(initial);
    // A cookie change re-renders the layouts with a new `initial`; adopt it without an effect.
    const [seenInitial, setSeenInitial] = useState(initial);
    if (!themeEquals(seenInitial, initial)) {
        setSeenInitial(initial);
        setCommitted(initial);
    }

    // Refs, not closures: a deferred restore created during a save must read the
    // theme that is committed when it *fires*, not when it was scheduled.
    const committedRef = useRef(committed);
    useEffect(() => { committedRef.current = committed; }, [committed]);
    // The theme a commit is saving; hover-out must fall back to it, not to the
    // previous committed theme, or the page flashes back until the save resolves.
    const pendingTheme = useRef<Theme | null>(null);
    // Last theme painted, so re-applying what is already on screen is a no-op.
    const applied = useRef<Theme>(initial);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearTimer = useCallback(() => {
        if (timer.current !== null) {
            clearTimeout(timer.current);
            timer.current = null;
        }
    }, []);

    const paint = useCallback((theme: Theme) => {
        if (themeEquals(applied.current, theme)) return;
        applied.current = theme;
        applyToDocument(theme);
    }, []);

    const restore = useCallback(() => paint(pendingTheme.current ?? committedRef.current), [paint]);

    // One timer for both preview and restore: the latest intent always wins.
    const schedule = useCallback((fn: () => void, delayMs: number) => {
        clearTimer();
        if (delayMs <= 0) {
            fn();
            return;
        }
        timer.current = setTimeout(() => {
            timer.current = null;
            fn();
        }, delayMs);
    }, [clearTimer]);

    const preview = useCallback((theme: Theme) => {
        if (pendingTheme.current) {   // a commit is in flight; never paint a third theme
            clearTimer();
            return;
        }
        schedule(() => paint(theme), PREVIEW_DELAY_MS);
    }, [clearTimer, schedule, paint]);

    const cancel = useCallback((delayMs: number = CANCEL_DELAY_MS) => schedule(restore, delayMs), [schedule, restore]);

    const commit = useCallback((theme: Theme) => {
        clearTimer();
        // Set before React re-renders the buttons as disabled: the blur that follows
        // must restore to this theme, not the previous one.
        pendingTheme.current = theme;
        paint(theme);
        startTransition(async () => {
            const result = await setAppearance(theme);
            if (pendingTheme.current === theme) pendingTheme.current = null;
            clearTimer();   // a leave-during-save must not revert what was just saved
            if (result.success) {
                const saved = result.theme ?? theme;
                committedRef.current = saved;
                setCommitted(saved);
                paint(saved);
                // The cookie write already re-renders the layouts; refresh is cheap insurance.
                router.refresh();
            } else {
                restore();
                toast.error(result.message ?? 'Could not save your theme');
            }
        });
    }, [clearTimer, paint, restore, router]);

    useEffect(() => clearTimer, [clearTimer]);

    const value = useMemo<ThemeContextValue>(() => ({
        theme: committed,
        mode: modeOfTheme(committed),
        tokens: tokensFor(committed),
        pending,
        preview,
        commit,
        cancel,
    }), [committed, pending, preview, commit, cancel]);

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): ThemeContextValue => {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
    return ctx;
};

// Colours for canvas/SVG/embeds that cannot read CSS variables. Tracks the
// committed theme only, so previews never re-embed TradingView widgets.
export const useThemeTokens = (): ThemeTokens => useTheme().tokens;

export default ThemeProvider;
