'use client';

import {useEffect, type FocusEvent} from "react";
import {useTheme} from "@/components/theme/ThemeProvider";
import {Switch} from "@/components/ui/switch";
import {cn} from "@/lib/utils";
import {PALETTE_IDS, PALETTES, type PaletteId} from "@/lib/theme/palettes";
import {PRESETS, findPreset, type Preset} from "@/lib/theme/presets";
import {STYLE_IDS, STYLES, type StyleId} from "@/lib/theme/styles";
import {DEFAULT_THEME, themeEquals, type Theme} from "@/lib/theme/resolve";

// Tiny rendition of a palette × style combination for the preset cards.
const ThemeSwatch = ({palette, style}: {palette: PaletteId; style: StyleId}) => {
    const t = PALETTES[palette].tokens;
    const radius = style === 'brutalist' ? 0 : style === 'minimal' ? 6 : style === 'futuristic' ? 5 : 10;
    const panelStyle: React.CSSProperties = {
        background: style === 'liquid-glass' ? `color-mix(in srgb, ${t.surface1} 60%, transparent)` : t.surface1,
        border: style === 'brutalist' ? `2px solid ${t.fg}` : `1px solid ${t.lineStrong}`,
        borderRadius: radius,
        boxShadow: style === 'futuristic'
            ? `0 0 10px ${t.brandStrong}55`
            : style === 'soft'
                ? '0 6px 14px rgb(0 0 0 / .25)'
                : style === 'brutalist'
                    ? `3px 3px 0 ${t.fg}`
                    : 'none',
    };
    return (
        <div className="h-20 w-full rounded-md p-2.5 relative overflow-hidden" style={{background: t.bg}} aria-hidden="true">
            {style === 'liquid-glass' && (
                <div className="absolute -top-6 -right-6 w-20 h-20 rounded-full opacity-60"
                     style={{background: `radial-gradient(circle, ${t.brand}66, transparent 70%)`}} />
            )}
            <div className="relative h-full w-full p-2 flex flex-col justify-between" style={panelStyle}>
                <div className="h-1.5 w-1/2 rounded-sm" style={{background: t.brand}} />
                <div className="flex items-center gap-1.5">
                    <div className="h-1 flex-1 rounded-sm" style={{background: t.fgMuted, opacity: 0.6}} />
                    <div className="h-2 w-2 rounded-full" style={{background: t.positive}} />
                    <div className="h-2 w-2 rounded-full" style={{background: t.negative}} />
                </div>
            </div>
        </div>
    );
};

const AppearanceSettings = () => {
    const {theme, pending, preview, commit, cancel} = useTheme();
    const activePreset = findPreset(theme.palette, theme.style);

    const apply = (next: Theme) => {
        if (!themeEquals(next, theme)) commit(next);
    };

    // Buttons only ever *start* a preview. The restore lives on the group, so the
    // gutter between two cards is inside the hover region and moving A → B never
    // passes through the committed theme.
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

    const presetTheme = (p: Preset): Theme => ({palette: p.palette, style: p.style, reduceMotion: theme.reduceMotion});

    return (
        <div className="space-y-8">
            {/* Presets */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <p className="text-sm text-fg-muted">Pick a look. Hover to preview, click to apply — it follows your account on every device.</p>
                    <button type="button"
                            onClick={() => apply({...DEFAULT_THEME, reduceMotion: theme.reduceMotion})}
                            disabled={pending || (theme.palette === DEFAULT_THEME.palette && theme.style === DEFAULT_THEME.style)}
                            className="text-xs uppercase tracking-[0.1em] text-fg-muted hover:text-brand transition-colors disabled:opacity-40"
                            style={{fontFamily: 'var(--type-mono)'}}>
                        Reset to default
                    </button>
                </div>
                <div role="radiogroup" aria-label="Theme presets" className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3" {...groupProps}>
                    {PRESETS.map((p) => {
                        const selected = activePreset?.id === p.id;
                        return (
                            <button key={p.id} type="button" role="radio" aria-checked={selected}
                                    disabled={pending}
                                    onClick={() => apply(presetTheme(p))}
                                    {...previewProps(presetTheme(p))}
                                    className={cn(
                                        'text-left rounded-xl border p-2.5 transition-all bg-surface-2/40 border-line-strong/20 hover:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                                        selected && 'border-brand ring-1 ring-brand',
                                    )}>
                                <ThemeSwatch palette={p.palette} style={p.style} />
                                <div className="mt-2.5 flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <div className="text-sm font-semibold text-fg truncate" style={{fontFamily: 'var(--type-display)'}}>{p.label}</div>
                                        <div className="text-[11px] text-fg-muted leading-snug mt-0.5">{p.description}</div>
                                    </div>
                                    {selected && <span className="material-symbols-outlined text-brand text-base shrink-0">check_circle</span>}
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Palette */}
            <div>
                <div className="text-[10px] uppercase tracking-[0.14em] text-fg-muted mb-2" style={{fontFamily: 'var(--type-mono)'}}>Palette</div>
                <div role="radiogroup" aria-label="Colour palette" className="flex flex-wrap gap-2" {...groupProps}>
                    {PALETTE_IDS.map((id) => {
                        const p = PALETTES[id];
                        const selected = theme.palette === id;
                        const next: Theme = {...theme, palette: id};
                        return (
                            <button key={id} type="button" role="radio" aria-checked={selected} disabled={pending}
                                    onClick={() => apply(next)} {...previewProps(next)}
                                    className={cn(
                                        'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors bg-surface-2/40 border-line-strong/20 text-fg-soft hover:border-brand/40 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                                        selected && 'border-brand text-fg',
                                    )}
                                    style={{fontFamily: 'var(--type-mono)'}}>
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

            {/* Style */}
            <div>
                <div className="text-[10px] uppercase tracking-[0.14em] text-fg-muted mb-2" style={{fontFamily: 'var(--type-mono)'}}>Style</div>
                <div role="radiogroup" aria-label="Visual style" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2" {...groupProps}>
                    {STYLE_IDS.map((id) => {
                        const s = STYLES[id];
                        const selected = theme.style === id;
                        const next: Theme = {...theme, style: id};
                        return (
                            <button key={id} type="button" role="radio" aria-checked={selected} disabled={pending}
                                    onClick={() => apply(next)} {...previewProps(next)}
                                    className={cn(
                                        'text-left rounded-lg border px-3 py-2.5 transition-colors bg-surface-2/40 border-line-strong/20 hover:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                                        selected && 'border-brand ring-1 ring-brand',
                                    )}>
                                <div className="text-sm font-semibold text-fg" style={{fontFamily: 'var(--type-display)'}}>{s.label}</div>
                                <div className="text-[11px] text-fg-muted leading-snug mt-0.5">{s.description}</div>
                                <div className="text-[10px] text-fg-muted mt-1.5" style={{fontFamily: 'var(--type-mono)'}}>
                                    {s.fonts.display} · {s.fonts.body}
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Motion */}
            <div className="flex items-center justify-between rounded-lg border border-line-strong/20 bg-surface-2/40 px-4 py-3">
                <div>
                    <div className="text-sm font-medium text-fg">Reduce motion</div>
                    <div className="text-[11px] text-fg-muted">Stops shimmer, particles and drifting backdrops. Your OS setting is always respected too.</div>
                </div>
                <Switch
                    id="reduce-motion-toggle"
                    checked={theme.reduceMotion}
                    disabled={pending}
                    onCheckedChange={(checked) => apply({...theme, reduceMotion: checked})}
                    className="data-[state=checked]:!bg-brand-strong data-[state=unchecked]:!bg-surface-4 data-[state=unchecked]:!border data-[state=unchecked]:!border-line-strong transition-colors duration-200"
                />
            </div>
        </div>
    );
};

export default AppearanceSettings;
