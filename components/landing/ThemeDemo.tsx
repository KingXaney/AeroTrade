'use client';

import {useState} from "react";
import {cn} from "@/lib/utils";
import {useTheme} from "@/components/theme/ThemeProvider";
import {PALETTES, type PaletteId} from "@/lib/theme/palettes";

// The landing page's theme switcher: each button repaints the page it is on in one palette. A
// visitor has no account to save a theme to, so this only previews (ThemeProvider.preview) —
// nothing is written, and a reload brings the default back. Six of the twelve palettes, the
// default first and one of the two light ones among them.
const SHOWN: readonly PaletteId[] = ['quiet-cyber', 'nord', 'paper', 'gruvbox-dark', 'catppuccin-mocha', 'dracula'];

// `label` names the group for a screen reader. The page passes it in (LANDING_COPY.themesGroup):
// importing the landing copy here would put the glossary it counts into the page's client bundle.
const ThemeDemo = ({label}: {label: string}) => {
    const {theme, preview} = useTheme();
    const [active, setActive] = useState<PaletteId | null>(null);
    const shownPalette = active ?? theme.palette;

    return (
        <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
            {SHOWN.map((id) => {
                const on = shownPalette === id;
                return (
                    <button
                        key={id}
                        type="button"
                        aria-pressed={on}
                        data-theme-demo={id}
                        onClick={() => {
                            setActive(id);
                            preview({palette: id, reduceMotion: theme.reduceMotion});
                        }}
                        className={cn(
                            'control-type rounded-lg border px-3 py-2 text-xs transition-colors',
                            on ? 'border-brand/40 bg-brand/10 text-brand' : 'border-line-strong/30 text-fg-soft hover:text-fg hover:bg-surface-3',
                        )}
                    >
                        {PALETTES[id].label}
                    </button>
                );
            })}
        </div>
    );
};

export default ThemeDemo;
