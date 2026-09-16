// The persisted dashboard layout and its editing helpers. PURE, like widgets.ts.
// Every helper is immutable and returns the SAME reference when nothing changed,
// so React state updates and dirty checks can rely on identity.

import {z} from 'zod';
import {
    CATEGORY_ORDER,
    WIDGET_IDS,
    WIDGET_SPANS,
    WIDGETS,
    clampSpan,
    isWidgetAvailable,
    isWidgetId,
    type AvailabilityContext,
    type WidgetId,
} from '@/lib/dashboard/widgets';

export const LAYOUT_VERSION = 1;
export const MAX_WIDGETS = 24;
// Hard cap on what the schemas even look at, so a hostile payload can't make
// normalizeLayout walk thousands of items before trimming.
const MAX_INPUT_WIDGETS = 64;

export const LayoutItemSchema = z.object({
    id: z.enum(WIDGET_IDS),
    span: z.literal([...WIDGET_SPANS]),
});

export const DashboardLayoutSchema = z.object({
    version: z.literal(LAYOUT_VERSION),
    widgets: z.array(LayoutItemSchema).max(MAX_INPUT_WIDGETS),
});

export type LayoutItem = z.infer<typeof LayoutItemSchema>;
export type DashboardLayout = z.infer<typeof DashboardLayoutSchema>;

// The dashboard as it shipped before followed topics. Kept verbatim: a saved
// layout that still equals it belongs to someone who never customised, and
// migrateLegacyDefault moves them to the topics-first default below.
export const LEGACY_DEFAULT_LAYOUT_V1: DashboardLayout = {
    version: LAYOUT_VERSION,
    widgets: [
        {id: 'portfolio-snapshot', span: 4},
        {id: 'watchlist-movers', span: 4},
        {id: 'friends-rank', span: 4},
        {id: 'news-brain-tile', span: 12},
        {id: 'tv-heatmap', span: 8},
        {id: 'tv-top-stories', span: 4},
    ],
};

// Topics first, then the personal strip, then markets.
export const DEFAULT_LAYOUT: DashboardLayout = {
    version: LAYOUT_VERSION,
    widgets: [
        {id: 'topics-overview', span: 4},
        {id: 'portfolio-snapshot', span: 4},
        {id: 'watchlist-movers', span: 4},
        {id: 'topics-latest', span: 8},
        {id: 'friends-rank', span: 4},
        {id: 'news-brain-tile', span: 12},
        {id: 'tv-heatmap', span: 8},
        {id: 'tv-top-stories', span: 4},
    ],
};

// Deep copy: callers (Mongoose documents, client state) must never be able to
// reach the shared default through a returned reference.
export const resetLayout = (): DashboardLayout => ({
    version: LAYOUT_VERSION,
    widgets: DEFAULT_LAYOUT.widgets.map((w) => ({...w})),
});

// Lenient shapes for whatever came out of the database: items are judged one by
// one so a single stale id (a widget removed in a later release) only drops
// itself instead of resetting the whole layout.
const LooseItemSchema = z.object({id: z.string(), span: z.unknown().optional()});
const LooseLayoutSchema = z.object({
    version: z.unknown(),
    widgets: z.array(z.unknown()).max(MAX_INPUT_WIDGETS),
});

export const normalizeLayout = (input: unknown): DashboardLayout => {
    const parsed = LooseLayoutSchema.safeParse(input);
    if (!parsed.success || parsed.data.version !== LAYOUT_VERSION) return resetLayout();

    const seen = new Set<WidgetId>();
    const widgets: LayoutItem[] = [];
    for (const raw of parsed.data.widgets) {
        if (widgets.length >= MAX_WIDGETS) break;
        const item = LooseItemSchema.safeParse(raw);
        if (!item.success) continue;
        const {id, span} = item.data;
        if (!isWidgetId(id) || seen.has(id)) continue;
        seen.add(id);
        widgets.push({
            id,
            span: typeof span === 'number' && Number.isFinite(span) ? clampSpan(id, span) : WIDGETS[id].defaultSpan,
        });
    }
    return {version: LAYOUT_VERSION, widgets};
};

// Not a version bump (that would wipe every customised dashboard): only a layout
// still identical to the old default is upgraded. Anything else is the user's.
// Applied when a saved layout is read (layout-store.ts), never on save.
export const migrateLegacyDefault = (layout: DashboardLayout): DashboardLayout =>
    layoutsEqual(layout, LEGACY_DEFAULT_LAYOUT_V1) ? resetLayout() : layout;

export const filterAvailable = (layout: DashboardLayout, ctx: AvailabilityContext): DashboardLayout => {
    const widgets = layout.widgets.filter((w) => isWidgetAvailable(WIDGETS[w.id], ctx));
    return widgets.length === layout.widgets.length ? layout : {...layout, widgets};
};

export const moveWidget = (layout: DashboardLayout, from: number, to: number): DashboardLayout => {
    const count = layout.widgets.length;
    const inRange = (i: number) => Number.isInteger(i) && i >= 0 && i < count;
    if (from === to || !inRange(from) || !inRange(to)) return layout;
    const widgets = [...layout.widgets];
    const [item] = widgets.splice(from, 1);
    widgets.splice(to, 0, item);
    return {...layout, widgets};
};

export const addWidget = (layout: DashboardLayout, id: WidgetId, span?: number): DashboardLayout => {
    if (!isWidgetId(id) || layout.widgets.length >= MAX_WIDGETS || layout.widgets.some((w) => w.id === id)) return layout;
    const item: LayoutItem = {id, span: span === undefined ? WIDGETS[id].defaultSpan : clampSpan(id, span)};
    return {...layout, widgets: [...layout.widgets, item]};
};

export const removeWidget = (layout: DashboardLayout, id: WidgetId): DashboardLayout => {
    const widgets = layout.widgets.filter((w) => w.id !== id);
    return widgets.length === layout.widgets.length ? layout : {...layout, widgets};
};

export const setSpan = (layout: DashboardLayout, id: WidgetId, span: number): DashboardLayout => {
    const index = layout.widgets.findIndex((w) => w.id === id);
    if (index === -1) return layout;
    const next = clampSpan(id, span);
    if (layout.widgets[index].span === next) return layout;
    const widgets = layout.widgets.map((w, i) => (i === index ? {...w, span: next} : w));
    return {...layout, widgets};
};

export const layoutsEqual = (a: DashboardLayout, b: DashboardLayout): boolean =>
    a === b || (
        a.version === b.version &&
        a.widgets.length === b.widgets.length &&
        a.widgets.every((w, i) => w.id === b.widgets[i].id && w.span === b.widgets[i].span)
    );

// Stable string identity for a layout — the dashboard grid is keyed on it so a
// saved change remounts with fresh widget bodies while an unchanged layout keeps
// its client state.
export const layoutFingerprint = (layout: DashboardLayout): string =>
    `v${layout.version}:${layout.widgets.map((w) => `${w.id}@${w.span}`).join(',')}`;

// Widgets the user could still add, grouped for the library by CATEGORY_ORDER
// (registry order within a category). Pass ctx to hide ones they can't use.
export const missingWidgetIds = (layout: DashboardLayout, ctx?: AvailabilityContext): WidgetId[] => {
    const present = new Set<WidgetId>(layout.widgets.map((w) => w.id));
    return WIDGET_IDS
        .filter((id) => !present.has(id) && (!ctx || isWidgetAvailable(WIDGETS[id], ctx)))
        .sort((a, b) => CATEGORY_ORDER.indexOf(WIDGETS[a].category) - CATEGORY_ORDER.indexOf(WIDGETS[b].category));
};
