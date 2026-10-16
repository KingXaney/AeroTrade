// Lab › Today as a HUD (the preference learn.labLayout): every part of the day — the list, the
// streak, the unit, the review, the problem, the papers, the progress — and every game card, as
// {id, span} rows on the dashboard's twelve-column grid, in the owner's order and at the widths
// they chose. PURE and client-safe, like
// lib/dashboard/layout.ts, whose shape it keeps: every helper is immutable and hands back the SAME
// reference when nothing changed, so the arranging state and its dirty check can rely on identity.
// A game's id is lib/lab/widgets' and a panel's is LAB_PANEL_IDS'; neither is ever renamed.

import {z} from 'zod';
import {LAB_WIDGET_IDS, isLabWidgetId, labWidget, normalizeLabWidgets, type LabWidgetId} from '@/lib/lab/widgets';

// Version 1 (2026-10-16, the morning) held the game cards alone, below the fixed panels; version
// 2 (that afternoon) the panels too, each at full width; version 3 (that evening) is the day on
// one screen — the list two-thirds wide and two rows tall, the streak compact at its top right, the
// unit under it, the problem a bar, the review beside the progress, the papers, the games last. A
// version-1 or version-2 layout reads as the day as it comes with the games it had, at the default
// width, at the end: the arrangement is replaced, which games are on Today is kept. An id the
// catalog no longer has (the check-in and the end of the day, removed that evening) is dropped on
// read, so a saved layout outlives a card.
export const LAB_LAYOUT_VERSION = 3;

// Of the grid's twelve columns: S, M, L and XL on the width picker (SPAN_LABELS in the dashboard
// catalog); never 3, which a card of the day is too narrow for.
export const LAB_SPANS = [4, 6, 8, 12] as const;
export type LabSpan = (typeof LAB_SPANS)[number];

// The parts of the day that are not a game, in the day's order.
export const LAB_PANEL_IDS = ['list', 'streak', 'unit', 'review', 'problem', 'papers', 'progress'] as const;
export type LabPanelId = (typeof LAB_PANEL_IDS)[number];

// Everything a card on Today can be: the panels, then the games (the library's order).
export const LAB_HUD_IDS = [...LAB_PANEL_IDS, ...LAB_WIDGET_IDS] as const;
export type LabHudId = (typeof LAB_HUD_IDS)[number];

// Every card the registry offers may be on the page at once.
export const MAX_LAB_WIDGETS = LAB_HUD_IDS.length;
// What the loose reader looks at before trimming, so a hostile payload is never walked whole.
const MAX_INPUT_WIDGETS = 64;

export type LabHudDef = {
    id: LabHudId;
    kind: 'panel' | 'game';
    // Material Symbols name, on the arranging handles and in the library.
    icon: string;
    spans: readonly LabSpan[];   // ascending
    defaultSpan: LabSpan;
    // Two rows tall from a desktop's width when narrower than the row (the list), so two cards a
    // third wide stack beside it. Never stored; components/lab/LabHud adds the class.
    tall?: true;
};

const WIDE: readonly LabSpan[] = [6, 8, 12];
const ANY: readonly LabSpan[] = [4, 6, 8, 12];
const panel = (id: LabPanelId, icon: string, spans: readonly LabSpan[], defaultSpan: LabSpan): LabHudDef => ({id, kind: 'panel', icon, spans, defaultSpan});
// A game card is a third wide by default, so the games tile three to a row.
const game = (id: LabWidgetId): LabHudDef => ({id, kind: 'game', icon: labWidget(id).icon, spans: ANY, defaultSpan: 4});

// The list's rows (a mark, two lines, a tick, the way in) want half the row at least; the compact
// streak, the unit, the review, the digest and a game read at a third; the progress keeps its five
// tiles on one line from half.
export const LAB_HUD: Readonly<Record<LabHudId, LabHudDef>> = {
    list: {...panel('list', 'checklist', WIDE, 8), tall: true},
    streak: panel('streak', 'local_fire_department', ANY, 4),
    unit: panel('unit', 'menu_book', ANY, 4),
    review: panel('review', 'style', ANY, 4),
    problem: panel('problem', 'functions', WIDE, 12),
    papers: panel('papers', 'article', ANY, 12),
    progress: panel('progress', 'insights', WIDE, 8),
    ...(Object.fromEntries(LAB_WIDGET_IDS.map((id) => [id, game(id)])) as Record<LabWidgetId, LabHudDef>),
};

const LabLayoutItemSchema = z.strictObject({
    id: z.enum(LAB_HUD_IDS),
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
export const isLabHudId = (value: unknown): value is LabHudId => typeof value === 'string' && Object.prototype.hasOwnProperty.call(LAB_HUD, value);
export const isLabPanelId = (value: unknown): value is LabPanelId => typeof value === 'string' && (LAB_PANEL_IDS as readonly string[]).includes(value);

// The nearest width the card allows; a tie goes to the smaller, so a clamped layout never grows.
export const clampLabSpan = (id: LabHudId, span: number): LabSpan => {
    const spans = LAB_HUD[id].spans;
    let best: LabSpan = spans[0];
    for (const candidate of spans) {
        if (Math.abs(candidate - span) < Math.abs(best - span)) best = candidate;
    }
    return best;
};

// The day as it comes, on one screen from a desktop's width: the list two-thirds wide and two rows
// tall (components/lab/LabHud adds the row span) with the streak and the unit stacked beside it, the
// problem a bar across (folded to its title), the review beside the progress, the papers, and the
// games last — the puzzle alone — three to a row.
export const DEFAULT_LAB_LAYOUT: LabLayout = {
    version: LAB_LAYOUT_VERSION,
    widgets: [
        {id: 'list', span: 8},
        {id: 'streak', span: 4},
        {id: 'unit', span: 4},
        {id: 'problem', span: 12},
        {id: 'review', span: 4},
        {id: 'progress', span: 8},
        {id: 'papers', span: 12},
        {id: 'daily-puzzle', span: 4},
    ],
};

// A fresh object every time, so no caller can reach the shared default through a returned reference.
export const resetLabLayout = (): LabLayout => ({
    version: LAB_LAYOUT_VERSION,
    widgets: DEFAULT_LAB_LAYOUT.widgets.map((w) => ({...w})),
});

// The default's panels with these games in the games slot — the end of the day, where the puzzle
// sits by default and where setGameOn adds a game: what a version-1 or version-2 layout and the
// older learn.labWidgets list read as.
export const layoutWithGames = (games: readonly LabLayoutItem[]): LabLayout => {
    const defaults = DEFAULT_LAB_LAYOUT.widgets;
    const slot = defaults.findIndex((w) => isLabWidgetId(w.id));
    const panels = (items: readonly LabLayoutItem[]) => items.filter((w) => !isLabWidgetId(w.id)).map((w) => ({...w}));
    return {version: LAB_LAYOUT_VERSION, widgets: [...panels(defaults.slice(0, slot)), ...games.map((w) => ({...w})), ...panels(defaults.slice(slot))]};
};

// Lenient shapes for whatever came out of the database: items are judged one by one, so one stale
// id drops itself alone instead of resetting the whole layout.
const LooseItemSchema = z.object({id: z.string(), span: z.unknown().optional()});
const LooseLayoutSchema = z.object({version: z.unknown(), widgets: z.array(z.unknown()).max(MAX_INPUT_WIDGETS)});

const readItems = (raws: readonly unknown[], allowed: (id: string) => id is LabHudId): LabLayoutItem[] => {
    const seen = new Set<LabHudId>();
    const widgets: LabLayoutItem[] = [];
    for (const raw of raws) {
        if (widgets.length >= MAX_LAB_WIDGETS) break;
        const item = LooseItemSchema.safeParse(raw);
        if (!item.success) continue;
        const {id, span} = item.data;
        if (!allowed(id) || seen.has(id)) continue;
        seen.add(id);
        widgets.push({id, span: typeof span === 'number' && Number.isFinite(span) ? clampLabSpan(id, span) : LAB_HUD[id].defaultSpan});
    }
    return widgets;
};

// A stored layout read back: version 3 as it is (unknown ids dropped, repeats folded, widths
// clamped or filled); version 1's or 2's games — in their order, at the default width — in the
// games slot of the day as it comes; anything else the default.
export const normalizeLabLayout = (input: unknown): LabLayout => {
    const parsed = LooseLayoutSchema.safeParse(input);
    if (!parsed.success) return resetLabLayout();
    if (parsed.data.version === LAB_LAYOUT_VERSION) return {version: LAB_LAYOUT_VERSION, widgets: readItems(parsed.data.widgets, isLabHudId)};
    if (parsed.data.version === 1 || parsed.data.version === 2) {
        const games = readItems(parsed.data.widgets, (id): id is LabWidgetId => isLabWidgetId(id));
        return layoutWithGames(games.map((w) => ({id: w.id, span: LAB_HUD[w.id].defaultSpan})));
    }
    return resetLabLayout();
};

// What the stored preference reads as: the layout when one was saved, else the older list of game
// ids at the default width (absent = the puzzle alone, an empty list = no games). The one
// composition lib/lab/store applies on read.
export const readLabLayout = (stored: {labLayout?: unknown; labWidgets?: unknown} | null | undefined): LabLayout => {
    if (stored?.labLayout !== undefined && stored.labLayout !== null) return normalizeLabLayout(stored.labLayout);
    if (Array.isArray(stored?.labWidgets)) return layoutWithGames(normalizeLabWidgets(stored.labWidgets).map((id) => ({id, span: LAB_HUD[id].defaultSpan})));
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

export const addLabWidget = (layout: LabLayout, id: LabHudId, span?: number): LabLayout => {
    if (!isLabHudId(id) || layout.widgets.length >= MAX_LAB_WIDGETS || layout.widgets.some((w) => w.id === id)) return layout;
    return {...layout, widgets: [...layout.widgets, {id, span: span === undefined ? LAB_HUD[id].defaultSpan : clampLabSpan(id, span)}]};
};

export const removeLabWidget = (layout: LabLayout, id: LabHudId): LabLayout => {
    const widgets = layout.widgets.filter((w) => w.id !== id);
    return widgets.length === layout.widgets.length ? layout : {...layout, widgets};
};

export const setLabSpan = (layout: LabLayout, id: LabHudId, span: number): LabLayout => {
    const index = layout.widgets.findIndex((w) => w.id === id);
    if (index === -1) return layout;
    const next = clampLabSpan(id, span);
    if (layout.widgets[index].span === next) return layout;
    return {...layout, widgets: layout.widgets.map((w, i) => (i === index ? {...w, span: next} : w))};
};

// A game switched on from the list goes to the end of the page; off takes its card away.
export const setGameOn = (layout: LabLayout, id: LabWidgetId, on: boolean): LabLayout =>
    on ? addLabWidget(layout, id) : removeLabWidget(layout, id);

export const labLayoutsEqual = (a: LabLayout, b: LabLayout): boolean =>
    a === b || (
        a.version === b.version
        && a.widgets.length === b.widgets.length
        && a.widgets.every((w, i) => w.id === b.widgets[i].id && w.span === b.widgets[i].span)
    );

// A stable string identity for a layout.
export const labLayoutFingerprint = (layout: LabLayout): string =>
    `v${layout.version}:${layout.widgets.map((w) => `${w.id}@${w.span}`).join(',')}`;

// The cards not yet on the page, in the registry's order: the library's rows.
export const missingLabWidgets = (layout: LabLayout): LabHudId[] => {
    const present = new Set<LabHudId>(layout.widgets.map((w) => w.id));
    return LAB_HUD_IDS.filter((id) => !present.has(id));
};

// The games on the page, in the page's order: what the list carries.
export const gamesOf = (layout: LabLayout): LabWidgetId[] => layout.widgets.flatMap((w) => (isLabWidgetId(w.id) ? [w.id] : []));
