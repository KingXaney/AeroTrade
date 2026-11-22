'use client';

import {useEffect, type FocusEvent} from "react";
import {useTheme} from "@/components/theme/ThemeProvider";
import Switch from "@/components/primitives/Switch";
import {cn} from "@/lib/utils";
import {APPEARANCE_COPY} from "@/lib/learn/copy/settings";
import {PALETTE_IDS, PALETTES} from "@/lib/theme/palettes";
import {DEFAULT_THEME, themeEquals, type Theme} from "@/lib/theme/resolve";
import RowCard from "@/components/primitives/RowCard";

// Settings › Appearance: everything a theme is — a palette and the Reduce motion choice
// (lib/theme/resolve.ts). The app has one look, so there is no style and no preset to pick.
const AppearanceSettings = () => {
    const {theme, pending, preview, commit, cancel} = useTheme();

    const apply = (next: Theme) => {
        if (!themeEquals(next, theme)) commit(next);
    };

    // Chips only ever *start* a preview. The restore lives on the group, so the gutter between
    // two chips is inside the hover region and moving A → B never passes through the committed
    // theme. A palette moves nothing on the page, so the chip stays under the pointer it is
    // previewed with; the click saves it.
    const previewProps = (next: Theme) => ({
        onMouseEnter: () => preview(next),
        onFocus: () => preview(next),
    });
    const groupProps = {
        onMouseLeave: () => cancel(),
        // React's onBlur is focusout (bubbles): only restore when focus leaves the group.
        onBlur: (e: FocusEvent<HTMLElement>) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) cancel();
        },
    };
    // Keyboard / ⌘K navigation away mid-hover fires no mouseleave.
    useEffect(() => () => cancel(0), [cancel]);

    return (
        <div className="space-y-8">
            {/* Palette */}
            <div>
                <div className="flex items-center justify-between gap-3 mb-3">
                    <p className="text-sm text-fg-muted">{APPEARANCE_COPY.intro}</p>
                    <button type="button"
                            onClick={() => apply({...DEFAULT_THEME, reduceMotion: theme.reduceMotion})}
                            disabled={pending || theme.palette === DEFAULT_THEME.palette}
                            className="label-type shrink-0 text-xs text-fg-muted hover:text-brand transition-colors disabled:opacity-40">
                        {APPEARANCE_COPY.reset}
                    </button>
                </div>
                <div role="radiogroup" aria-label={APPEARANCE_COPY.paletteGroup} className="flex flex-wrap gap-2" {...groupProps}>
                    {PALETTE_IDS.map((id) => {
                        const p = PALETTES[id];
                        const selected = theme.palette === id;
                        const next: Theme = {...theme, palette: id};
                        return (
                            <button key={id} type="button" role="radio" aria-checked={selected} disabled={pending}
                                    onClick={() => apply(next)} {...previewProps(next)}
                                    className={cn(
                                        'font-mono inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors bg-surface-2/40 border-line-strong/20 text-fg-soft hover:border-brand/40 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                                        selected && 'border-brand text-fg',
                                    )}>
                                <span className="flex -space-x-1" aria-hidden="true">
                                    {p.swatch.map((c, i) => (
                                        <span key={i} className="h-3 w-3 rounded-full border border-black/30" style={{background: c}} />
                                    ))}
                                </span>
                                {p.label}
                                <span className="text-[10px] text-fg-muted">{p.mode}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Motion */}
            <RowCard className="flex items-center justify-between">
                <div>
                    <div className="text-sm font-medium text-fg">{APPEARANCE_COPY.motion.title}</div>
                    <div className="text-[11px] text-fg-muted">{APPEARANCE_COPY.motion.hint}</div>
                </div>
                <Switch
                    id="reduce-motion-toggle"
                    checked={theme.reduceMotion}
                    disabled={pending}
                    onCheckedChange={(checked) => apply({...theme, reduceMotion: checked})}
                />
            </RowCard>
        </div>
    );
};

export default AppearanceSettings;
