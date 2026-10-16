// Where the game widgets sit on Lab › Today and how wide (the preference learn.labLayout): the
// widgets as {id, span} rows on the dashboard's twelve-column grid, in the owner's order. PURE
// and client-safe, like lib/dashboard/layout.ts, whose shape it keeps: every helper is immutable
// and hands back the SAME reference when nothing changed, so the arranging view's state and its
// dirty check can rely on identity. The ids are lib/lab/widgets' and are never renamed.

import {z} from 'zod';
import {DEFAULT_LAB_WIDGETS, LAB_WIDGET_IDS, isLabWidgetId, normalizeLabWidgets, type LabWidgetId} from '@/lib/lab/widgets';

export const LAB_LAYOUT_VERSION = 1;
// Of the grid's twelve columns: S, M, L and XL on the width picker (SPAN_LABELS in the dashboard
// catalog); never 3, which a game card is too narrow for.
export const LAB_SPANS = [4, 6, 8, 12] as const;
export type LabSpan = (typeof LAB_SPANS)[number];
export const DEFAULT_LAB_SPAN: LabSpan = 6;
// Every widget the registry offers may be on the page at once.
export const MAX_LAB_WIDGETS = LAB_WIDGET_IDS.length;
// What the loose reader looks at before trimming, so a hostile payload is never walked whole.
const MAX_INPUT_WIDGETS = 64;

const LabLayoutItemSchema = z.strictObject({
    id: z.enum(LAB_WIDGET_IDS),
    span: z.literal([...LAB_SPANS]),
});

// What the arranging view sends: strict, so a stray key or a span off the scale is refused.
export const LabLayoutSchema = z.strictObject({
    version: z.literal(LAB_LAYOUT_VERSION),
    widgets: z.array(LabLayoutItemSchema).max(MAX_INPUT_WIDGETS),
});

export type LabLayoutItem = z.infer<typeof LabLayoutItemSchema>;
export type LabLayout = z.infer<typeof LabLayoutSchema>;

export const isLabSpan = (value: unknown): value is LabSpan => typeof value === 'number' && (LAB_SPANS as readonly number[]).includes(value);

// The nearest span on the scale; a tie goes to the smaller, so a clamped layout never grows.
export const clampLabSpan = (span: number): LabSpan => {
    let best: LabSpan = LAB_SPANS[0];
    for (const candidate of LAB_SPANS) {
        if (Math.abs(candidate - span) < Math.abs(best - span)) best = candidate;
    }
    return best;
};

// The layout before the owner has chosen: the puzzle alone, at the default width. A fresh object
// every time, so no caller can reach the shared default through a returned reference.
export const resetLabLayout = (): LabLayout => ({
    version: LAB_LAYOUT_VERSION,
    widgets: DEFAULT_LAB_WIDGETS.map((id) => ({id, span: DEFAULT_LAB_SPAN})),
});

// Every id at the default width, in the registry's order: what the older learn.labWidgets list
// reads as, and what `normalizeLabWidgets` makes of any list of ids.
export const layoutFromIds = (ids: readonly unknown[]): LabLayout => ({
    version: LAB_LAYOUT_VERSION,
    widgets: normalizeLabWidgets(ids).map((id) => ({id, span: DEFAULT_LAB_SPAN})),
});

// Lenient shapes for whatever came out of the database: items are judged one by one, so one stale
// id drops itself alone instead of resetting the whole layout.
const LooseItemSchema = z.object({id: z.string(), span: z.unknown().optional()});
const LooseLayoutSchema = z.object({version: z.unknown(), widgets: z.array(z.unknown()).max(MAX_INPUT_WIDGETS)});

export const normalizeLabLayout = (input: unknown): LabLayout => {
    const parsed = LooseLayoutSchema.safeParse(input);
    if (!parsed.success || parsed.data.version !== LAB_LAYOUT_VERSION) return resetLabLayout();
    const seen = new Set<LabWidgetId>();
    const widgets: LabLayoutItem[] = [];
    for (const raw of parsed.data.widgets) {
        if (widgets.length >= MAX_LAB_WIDGETS) break;
        const item = LooseItemSchema.safeParse(raw);
        if (!item.success) continue;
        const {id, span} = item.data;
        if (!isLabWidgetId(id) || seen.has(id)) continue;
        seen.add(id);
        widgets.push({id, span: typeof span === 'number' && Number.isFinite(span) ? clampLabSpan(span) : DEFAULT_LAB_SPAN});
    }
    return {version: LAB_LAYOUT_VERSION, widgets};
};

// What the stored preference reads as: the layout when one was saved, else the older list of ids
// at the default width (absent = the puzzle alone, an empty list = none). The one composition
// lib/lab/store applies on read.
export const readLabLayout = (stored: {labLayout?: unknown; labWidgets?: unknown} | null | undefined): LabLayout => {
    if (stored?.labLayout !== undefined && stored.labLayout !== null) return normalizeLabLayout(stored.labLayout);
    if (Array.isArray(stored?.labWidgets)) return layoutFromIds(stored.labWidgets);
    return resetLabLayout();
};

export const moveLabWidget = (layout: LabLayout, from: number, to: number): LabLayout => {
    const count = layout.widgets.length;
    const inRange = (i: number) => Number.isInteger(i) && i >= 0 && i < count;
    if (from === to || !inRange(from) || !inRange(to)) return layout;
    const widgets = [...layout.widgets];
    const [item] = widgets.splice(from, 1);
    widgets.splice(to, 0, item);
    return {...layout, widgets};
};

export const addLabWidget = (layout: LabLayout, id: LabWidgetId, span: LabSpan = DEFAULT_LAB_SPAN): LabLayout => {
    if (!isLabWidgetId(id) || layout.widgets.length >= MAX_LAB_WIDGETS || layout.widgets.some((w) => w.id === id)) return layout;
    return {...layout, widgets: [...layout.widgets, {id, span: clampLabSpan(span)}]};
};

export const removeLabWidget = (layout: LabLayout, id: LabWidgetId): LabLayout => {
    const widgets = layout.widgets.filter((w) => w.id !== id);
    return widgets.length === layout.widgets.length ? layout : {...layout, widgets};
};

export const setLabSpan = (layout: LabLayout, id: LabWidgetId, span: number): LabLayout => {
    const index = layout.widgets.findIndex((w) => w.id === id);
    if (index === -1) return layout;
    const next = clampLabSpan(span);
    if (layout.widgets[index].span === next) return layout;
    return {...layout, widgets: layout.widgets.map((w, i) => (i === index ? {...w, span: next} : w))};
};

export const labLayoutsEqual = (a: LabLayout, b: LabLayout): boolean =>
    a === b || (
        a.version === b.version
        && a.widgets.length === b.widgets.length
        && a.widgets.every((w, i) => w.id === b.widgets[i].id && w.span === b.widgets[i].span)
    );

// A stable string identity: the page keys its grid on it, so a saved change remounts with fresh
// bodies while an unchanged layout keeps its client state.
export const labLayoutFingerprint = (layout: LabLayout): string =>
    `v${layout.version}:${layout.widgets.map((w) => `${w.id}@${w.span}`).join(',')}`;

// The widgets not yet on the page, in the registry's order: the library's rows.
export const missingLabWidgets = (layout: LabLayout): LabWidgetId[] => {
    const present = new Set<LabWidgetId>(layout.widgets.map((w) => w.id));
    return LAB_WIDGET_IDS.filter((id) => !present.has(id));
};
