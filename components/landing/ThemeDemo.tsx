'use client';

import {useState} from "react";
import {cn} from "@/lib/utils";
import {useTheme} from "@/components/theme/ThemeProvider";
import {PRESETS} from "@/lib/theme/presets";

// The landing page's theme switcher: each preset repaints the page it is on. A visitor has no
// account to save a theme to, so this only previews (ThemeProvider.preview, the whole theme —
// it is a click, so the layout may move) — nothing is written, and a reload brings the default
// back.
const SHOWN = ['quiet-cyber', 'neon-terminal', 'paper', 'gruvbox-brutal', 'mocha-soft', 'dracula-glass'];

const ThemeDemo = () => {
    const {theme, preview} = useTheme();
    const [active, setActive] = useState<string | null>(null);
    const presets = SHOWN.map((id) => PRESETS.find((p) => p.id === id)).filter((p) => p !== undefined);

    return (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Preview a theme">
            {presets.map((preset) => {
                const on = active ? active === preset.id : (theme.palette === preset.palette && theme.style === preset.style);
                return (
                    <button
                        key={preset.id}
                        type="button"
                        aria-pressed={on}
                        data-theme-demo={preset.id}
                        onClick={() => {
                            setActive(preset.id);
                            preview({palette: preset.palette, style: preset.style, reduceMotion: theme.reduceMotion}, {full: true});
                        }}
                        className={cn(
                            'control-type rounded-lg border px-3 py-2 text-xs transition-colors',
                            on ? 'border-brand/40 bg-brand/10 text-brand' : 'border-line-strong/30 text-fg-soft hover:text-fg hover:bg-surface-3',
                        )}
                    >
                        {preset.label}
                    </button>
                );
            })}
        </div>
    );
};

export default ThemeDemo;
