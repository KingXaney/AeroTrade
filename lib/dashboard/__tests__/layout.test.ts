import {describe, expect, it} from 'vitest';
import {
    DEFAULT_LAYOUT,
    DashboardLayoutSchema,
    LAYOUT_VERSION,
    LEGACY_DEFAULT_LAYOUT_V1,
    MAX_WIDGETS,
    addWidget,
    filterAvailable,
    layoutFingerprint,
    layoutsEqual,
    migrateLegacyDefault,
    missingWidgetIds,
    moveWidget,
    normalizeLayout,
    removeWidget,
    resetLayout,
    setSpan,
    type DashboardLayout,
    type LayoutItem,
} from '@/lib/dashboard/layout';
import {CATEGORY_ORDER, WIDGETS, WIDGET_IDS} from '@/lib/dashboard/widgets';

// Frozen inputs turn any accidental mutation into a TypeError (modules are strict).
const layout = (widgets: LayoutItem[]): DashboardLayout => {
    const value: DashboardLayout = {version: LAYOUT_VERSION, widgets};
    widgets.forEach((w) => Object.freeze(w));
    Object.freeze(widgets);
    return Object.freeze(value);
};

const ids = (l: DashboardLayout) => l.widgets.map((w) => w.id);

describe('constants', () => {
    it('pins the version and widget cap', () => {
        expect(LAYOUT_VERSION).toBe(1);
        expect(MAX_WIDGETS).toBe(24);
    });

    it('DEFAULT_LAYOUT is the topics-first dashboard', () => {
        expect(DEFAULT_LAYOUT).toEqual({
            version: 1,
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
        });
    });

    it('LEGACY_DEFAULT_LAYOUT_V1 is the pre-topics dashboard, verbatim', () => {
        expect(LEGACY_DEFAULT_LAYOUT_V1).toEqual({
            version: 1,
            widgets: [
                {id: 'portfolio-snapshot', span: 4},
                {id: 'watchlist-movers', span: 4},
                {id: 'friends-rank', span: 4},
                {id: 'news-brain-tile', span: 12},
                {id: 'tv-heatmap', span: 8},
                {id: 'tv-top-stories', span: 4},
            ],
        });
        expect(layoutsEqual(LEGACY_DEFAULT_LAYOUT_V1, DEFAULT_LAYOUT)).toBe(false);
    });
});

describe('migrateLegacyDefault', () => {
    const legacyCopy = () => layout(LEGACY_DEFAULT_LAYOUT_V1.widgets.map((w) => ({...w})));

    it('upgrades a layout still equal to the old default', () => {
        const upgraded = migrateLegacyDefault(legacyCopy());
        expect(upgraded).toEqual(DEFAULT_LAYOUT);
        expect(upgraded).not.toBe(DEFAULT_LAYOUT);
        expect(upgraded.widgets).not.toBe(DEFAULT_LAYOUT.widgets);
    });

    it('leaves anything the user touched alone, by reference', () => {
        const reordered = layout([LEGACY_DEFAULT_LAYOUT_V1.widgets[1], LEGACY_DEFAULT_LAYOUT_V1.widgets[0], ...LEGACY_DEFAULT_LAYOUT_V1.widgets.slice(2)]);
        const resized = layout(LEGACY_DEFAULT_LAYOUT_V1.widgets.map((w, i) => (i === 0 ? {...w, span: 6} : w)));
        const extended = layout([...LEGACY_DEFAULT_LAYOUT_V1.widgets, {id: 'quick-links', span: 4}]);
        const trimmed = layout(LEGACY_DEFAULT_LAYOUT_V1.widgets.slice(1));
        const empty = layout([]);
        for (const l of [reordered, resized, extended, trimmed, empty, DEFAULT_LAYOUT]) {
            expect(migrateLegacyDefault(l)).toBe(l);
        }
    });

    it('is not part of normalizeLayout, so a save is never rewritten', () => {
        expect(normalizeLayout(LEGACY_DEFAULT_LAYOUT_V1)).toEqual(LEGACY_DEFAULT_LAYOUT_V1);
        // Composed at the read site: a span that clamps back onto the legacy value still migrates.
        const stillLegacy = {version: 1, widgets: LEGACY_DEFAULT_LAYOUT_V1.widgets.map((w) => (w.id === 'tv-heatmap' ? {...w, span: 9} : w))};
        expect(migrateLegacyDefault(normalizeLayout(stillLegacy))).toEqual(DEFAULT_LAYOUT);
        const customised = {version: 1, widgets: LEGACY_DEFAULT_LAYOUT_V1.widgets.map((w) => (w.id === 'tv-heatmap' ? {...w, span: 7} : w))};
        expect(migrateLegacyDefault(normalizeLayout(customised)).widgets.map((w) => w.id)).toEqual(LEGACY_DEFAULT_LAYOUT_V1.widgets.map((w) => w.id));
    });
});

describe('DashboardLayoutSchema', () => {
    it('accepts the default layout', () => {
        expect(DashboardLayoutSchema.safeParse(DEFAULT_LAYOUT).success).toBe(true);
    });

    it('rejects unknown ids, bad spans and other versions with issues', () => {
        const badId = DashboardLayoutSchema.safeParse({version: 1, widgets: [{id: 'nope', span: 4}]});
        expect(badId.success).toBe(false);
        expect(badId.error?.issues[0]?.path).toEqual(['widgets', 0, 'id']);

        const badSpan = DashboardLayoutSchema.safeParse({version: 1, widgets: [{id: 'leaderboard', span: 5}]});
        expect(badSpan.success).toBe(false);
        expect(badSpan.error?.issues[0]?.path).toEqual(['widgets', 0, 'span']);

        expect(DashboardLayoutSchema.safeParse({version: 2, widgets: []}).success).toBe(false);
        expect(DashboardLayoutSchema.safeParse({version: '1', widgets: []}).success).toBe(false);
    });

    it('caps the input at 64 items', () => {
        const widgets = Array.from({length: 65}, () => ({id: 'leaderboard', span: 6}));
        expect(DashboardLayoutSchema.safeParse({version: 1, widgets}).success).toBe(false);
        expect(DashboardLayoutSchema.safeParse({version: 1, widgets: widgets.slice(0, 64)}).success).toBe(true);
    });
});

describe('normalizeLayout', () => {
    it('falls back to a fresh default on junk', () => {
        const junk: unknown[] = [
            null, undefined, 'layout', 42, BigInt(10), Symbol('x'), () => undefined, new Date(),
            [], {}, {version: 1}, {widgets: []}, {version: 1, widgets: 'nope'}, Object.create(null),
        ];
        for (const input of junk) {
            const result = normalizeLayout(input);
            expect(result).toEqual(DEFAULT_LAYOUT);
            expect(result).not.toBe(DEFAULT_LAYOUT);
            expect(result.widgets).not.toBe(DEFAULT_LAYOUT.widgets);
        }
    });

    it('falls back to the default on a version mismatch', () => {
        expect(normalizeLayout({version: 2, widgets: [{id: 'leaderboard', span: 6}]})).toEqual(DEFAULT_LAYOUT);
        expect(normalizeLayout({version: '1', widgets: [{id: 'leaderboard', span: 6}]})).toEqual(DEFAULT_LAYOUT);
        expect(normalizeLayout({version: 0, widgets: []})).toEqual(DEFAULT_LAYOUT);
    });

    it('drops unknown ids and keeps the rest in order', () => {
        const result = normalizeLayout({
            version: 1,
            widgets: [{id: 'nope', span: 4}, {id: 'leaderboard', span: 6}, {id: 'toString', span: 4}, {id: 'tv-heatmap', span: 8}],
        });
        expect(result.widgets).toEqual([{id: 'leaderboard', span: 6}, {id: 'tv-heatmap', span: 8}]);
    });

    it('drops duplicate ids keeping the first occurrence', () => {
        const result = normalizeLayout({
            version: 1,
            widgets: [{id: 'leaderboard', span: 6}, {id: 'tv-heatmap', span: 8}, {id: 'leaderboard', span: 12}],
        });
        expect(result.widgets).toEqual([{id: 'leaderboard', span: 6}, {id: 'tv-heatmap', span: 8}]);
    });

    it('clamps spans to the widget\'s allowed set', () => {
        const result = normalizeLayout({
            version: 1,
            widgets: [
                {id: 'portfolio-snapshot', span: 12},   // [3, 4, 6] -> 6
                {id: 'tv-heatmap', span: 7},            // [6, 8, 12] -> 6 (tie -> smaller)
                {id: 'leaderboard', span: 1},           // [4, 6, 8, 12] -> 4
                {id: 'tv-top-stories', span: 5},        // [4, 6, 8] -> 4
            ],
        });
        expect(result.widgets.map((w) => w.span)).toEqual([6, 6, 4, 4]);
    });

    it('uses the default span when the span is missing or not a finite number', () => {
        const result = normalizeLayout({
            version: 1,
            widgets: [
                {id: 'leaderboard'},
                {id: 'tv-heatmap', span: '8'},
                {id: 'recent-trades', span: Number.NaN},
                {id: 'active-theses', span: Number.POSITIVE_INFINITY},
                {id: 'quick-links', span: null},
            ],
        });
        expect(result.widgets.map((w) => w.span)).toEqual([
            WIDGETS.leaderboard.defaultSpan,
            WIDGETS['tv-heatmap'].defaultSpan,
            WIDGETS['recent-trades'].defaultSpan,
            WIDGETS['active-theses'].defaultSpan,
            WIDGETS['quick-links'].defaultSpan,
        ]);
    });

    it('skips malformed items instead of resetting the whole layout', () => {
        const result = normalizeLayout({
            version: 1,
            widgets: [null, 'leaderboard', 5, {span: 4}, {id: 7, span: 4}, {id: 'leaderboard', span: 6}, []],
        });
        expect(result.widgets).toEqual([{id: 'leaderboard', span: 6}]);
    });

    it('strips unknown keys', () => {
        const result = normalizeLayout({version: 1, widgets: [{id: 'leaderboard', span: 6, extra: true}], junk: 1});
        expect(result).toEqual({version: 1, widgets: [{id: 'leaderboard', span: 6}]});
    });

    it('trims to MAX_WIDGETS after dropping invalid items', () => {
        const all = WIDGET_IDS.map((id) => ({id, span: WIDGETS[id].defaultSpan}));
        const result = normalizeLayout({version: 1, widgets: [{id: 'nope', span: 4}, ...all]});
        expect(result.widgets).toHaveLength(MAX_WIDGETS);
        expect(ids(result)).toEqual(WIDGET_IDS.slice(0, MAX_WIDGETS));
    });

    it('treats more than 64 input items as junk', () => {
        const widgets = Array.from({length: 65}, () => ({id: 'leaderboard', span: 6}));
        expect(normalizeLayout({version: 1, widgets})).toEqual(DEFAULT_LAYOUT);
    });

    it('keeps an empty layout empty', () => {
        expect(normalizeLayout({version: 1, widgets: []})).toEqual({version: 1, widgets: []});
    });

    it('is idempotent and a no-op on the default layout', () => {
        expect(normalizeLayout(DEFAULT_LAYOUT)).toEqual(DEFAULT_LAYOUT);
        const messy = {version: 1, widgets: [{id: 'tv-heatmap', span: 7}, {id: 'nope'}, {id: 'tv-heatmap', span: 12}]};
        const once = normalizeLayout(messy);
        expect(normalizeLayout(once)).toEqual(once);
    });
});

describe('filterAvailable', () => {
    const mixed = layout([
        {id: 'leaderboard', span: 6},
        {id: 'strategy-comparison', span: 12},
        {id: 'brain-status', span: 12},
    ]);

    it('removes widgets the user cannot use', () => {
        expect(ids(filterAvailable(mixed, {accountCount: 1, advanced: false}))).toEqual(['leaderboard']);
        expect(ids(filterAvailable(mixed, {accountCount: 2, advanced: false}))).toEqual(['leaderboard', 'strategy-comparison']);
        expect(ids(filterAvailable(mixed, {accountCount: 1, advanced: true}))).toEqual(['leaderboard', 'brain-status']);
    });

    it('returns the same reference when nothing is removed', () => {
        expect(filterAvailable(mixed, {accountCount: 2, advanced: true})).toBe(mixed);
        expect(filterAvailable(DEFAULT_LAYOUT, {accountCount: 0, advanced: false})).toBe(DEFAULT_LAYOUT);
    });
});

describe('moveWidget', () => {
    const abc = layout([{id: 'leaderboard', span: 6}, {id: 'tv-heatmap', span: 8}, {id: 'quick-links', span: 4}]);

    it('moves an item to a new index', () => {
        expect(ids(moveWidget(abc, 0, 2))).toEqual(['tv-heatmap', 'quick-links', 'leaderboard']);
        expect(ids(moveWidget(abc, 2, 0))).toEqual(['quick-links', 'leaderboard', 'tv-heatmap']);
        expect(ids(moveWidget(abc, 0, 1))).toEqual(['tv-heatmap', 'leaderboard', 'quick-links']);
        expect(ids(abc)).toEqual(['leaderboard', 'tv-heatmap', 'quick-links']);
    });

    it('keeps the item objects and the version', () => {
        const moved = moveWidget(abc, 0, 2);
        expect(moved.version).toBe(1);
        expect(moved.widgets[2]).toBe(abc.widgets[0]);
    });

    it('returns the same reference for no-op or invalid moves', () => {
        expect(moveWidget(abc, 1, 1)).toBe(abc);
        expect(moveWidget(abc, 0, 3)).toBe(abc);
        expect(moveWidget(abc, 3, 0)).toBe(abc);
        expect(moveWidget(abc, -1, 0)).toBe(abc);
        expect(moveWidget(abc, 0, -1)).toBe(abc);
        expect(moveWidget(abc, 0.5, 1)).toBe(abc);
        expect(moveWidget(abc, 0, Number.NaN)).toBe(abc);
    });
});

describe('addWidget', () => {
    const base = layout([{id: 'leaderboard', span: 6}]);

    it('appends with the default span', () => {
        const next = addWidget(base, 'tv-heatmap');
        expect(next.widgets).toEqual([{id: 'leaderboard', span: 6}, {id: 'tv-heatmap', span: 8}]);
        expect(next).not.toBe(base);
        expect(base.widgets).toHaveLength(1);
    });

    it('clamps an explicit span', () => {
        expect(addWidget(base, 'tv-heatmap', 12).widgets[1]).toEqual({id: 'tv-heatmap', span: 12});
        expect(addWidget(base, 'tv-heatmap', 7).widgets[1]).toEqual({id: 'tv-heatmap', span: 6});
        expect(addWidget(base, 'portfolio-snapshot', 100).widgets[1]).toEqual({id: 'portfolio-snapshot', span: 6});
    });

    it('returns the same reference when the widget is already present', () => {
        expect(addWidget(base, 'leaderboard')).toBe(base);
        expect(addWidget(base, 'leaderboard', 12)).toBe(base);
    });

    it('returns the same reference when the layout is full', () => {
        const full = layout(WIDGET_IDS.slice(0, MAX_WIDGETS).map((id) => ({id, span: WIDGETS[id].defaultSpan})));
        expect(addWidget(full, WIDGET_IDS[MAX_WIDGETS])).toBe(full);
        expect(addWidget(full, WIDGET_IDS[MAX_WIDGETS]).widgets).toHaveLength(MAX_WIDGETS);
    });

    it('ignores ids that are not in the registry at runtime', () => {
        expect(addWidget(base, 'nope' as LayoutItem['id'])).toBe(base);
    });
});

describe('removeWidget', () => {
    const base = layout([{id: 'leaderboard', span: 6}, {id: 'tv-heatmap', span: 8}]);

    it('removes the widget', () => {
        const next = removeWidget(base, 'leaderboard');
        expect(ids(next)).toEqual(['tv-heatmap']);
        expect(next.widgets[0]).toBe(base.widgets[1]);
        expect(ids(base)).toEqual(['leaderboard', 'tv-heatmap']);
    });

    it('returns the same reference when the widget is absent', () => {
        expect(removeWidget(base, 'quick-links')).toBe(base);
    });
});

describe('setSpan', () => {
    const base = layout([{id: 'leaderboard', span: 6}, {id: 'tv-heatmap', span: 8}]);

    it('sets a clamped span and keeps the other items', () => {
        const next = setSpan(base, 'leaderboard', 12);
        expect(next.widgets).toEqual([{id: 'leaderboard', span: 12}, {id: 'tv-heatmap', span: 8}]);
        expect(next.widgets[1]).toBe(base.widgets[1]);
        expect(setSpan(base, 'leaderboard', 5).widgets[0].span).toBe(4);
        expect(base.widgets[0].span).toBe(6);
    });

    it('returns the same reference when nothing changes', () => {
        expect(setSpan(base, 'leaderboard', 6)).toBe(base);
        expect(setSpan(base, 'tv-heatmap', 7).widgets[1].span).toBe(6);   // tie -> smaller, so this changes
        expect(setSpan(base, 'tv-heatmap', 9)).toBe(base);   // 9 -> 8 (current)
        expect(setSpan(base, 'quick-links', 4)).toBe(base);
    });
});

describe('layoutsEqual + layoutFingerprint', () => {
    const a = layout([{id: 'leaderboard', span: 6}, {id: 'tv-heatmap', span: 8}]);
    const same = layout([{id: 'leaderboard', span: 6}, {id: 'tv-heatmap', span: 8}]);
    const reordered = layout([{id: 'tv-heatmap', span: 8}, {id: 'leaderboard', span: 6}]);
    const resized = layout([{id: 'leaderboard', span: 12}, {id: 'tv-heatmap', span: 8}]);
    const shorter = layout([{id: 'leaderboard', span: 6}]);

    it('compares by content', () => {
        expect(layoutsEqual(a, a)).toBe(true);
        expect(layoutsEqual(a, same)).toBe(true);
        expect(layoutsEqual(a, reordered)).toBe(false);
        expect(layoutsEqual(a, resized)).toBe(false);
        expect(layoutsEqual(a, shorter)).toBe(false);
        expect(layoutsEqual(shorter, a)).toBe(false);
    });

    it('fingerprints agree with layoutsEqual', () => {
        expect(layoutFingerprint(a)).toBe(layoutFingerprint(same));
        expect(layoutFingerprint(a)).not.toBe(layoutFingerprint(reordered));
        expect(layoutFingerprint(a)).not.toBe(layoutFingerprint(resized));
        expect(layoutFingerprint(a)).not.toBe(layoutFingerprint(shorter));
    });

    it('has a readable, versioned format', () => {
        expect(layoutFingerprint(DEFAULT_LAYOUT))
            .toBe('v1:topics-overview@4,portfolio-snapshot@4,watchlist-movers@4,topics-latest@8,friends-rank@4,news-brain-tile@12,tv-heatmap@8,tv-top-stories@4');
        expect(layoutFingerprint(LEGACY_DEFAULT_LAYOUT_V1))
            .toBe('v1:portfolio-snapshot@4,watchlist-movers@4,friends-rank@4,news-brain-tile@12,tv-heatmap@8,tv-top-stories@4');
        expect(layoutFingerprint({version: 1, widgets: []})).toBe('v1:');
    });
});

describe('resetLayout', () => {
    it('returns a deep copy of the default', () => {
        const fresh = resetLayout();
        expect(fresh).toEqual(DEFAULT_LAYOUT);
        expect(fresh).not.toBe(DEFAULT_LAYOUT);
        expect(fresh.widgets).not.toBe(DEFAULT_LAYOUT.widgets);
        fresh.widgets.forEach((w, i) => expect(w).not.toBe(DEFAULT_LAYOUT.widgets[i]));
        expect(resetLayout().widgets).not.toBe(fresh.widgets);
    });
});

describe('missingWidgetIds', () => {
    it('lists every widget not in the layout', () => {
        const missing = missingWidgetIds(DEFAULT_LAYOUT);
        expect(missing).toHaveLength(WIDGET_IDS.length - DEFAULT_LAYOUT.widgets.length);
        for (const w of DEFAULT_LAYOUT.widgets) {
            expect(missing).not.toContain(w.id);
        }
        expect(missingWidgetIds({version: 1, widgets: []})).toEqual([...WIDGET_IDS]);
    });

    it('hides unavailable widgets when a context is given', () => {
        const missing = missingWidgetIds(DEFAULT_LAYOUT, {accountCount: 1, advanced: false});
        expect(missing).not.toContain('strategy-comparison');
        expect(missing).not.toContain('brain-status');
        expect(missing).toHaveLength(WIDGET_IDS.length - DEFAULT_LAYOUT.widgets.length - 2);
        expect(missingWidgetIds(DEFAULT_LAYOUT, {accountCount: 2, advanced: true})).toContain('strategy-comparison');
    });

    it('is grouped by CATEGORY_ORDER', () => {
        const ranks = missingWidgetIds({version: 1, widgets: []}).map((id) => CATEGORY_ORDER.indexOf(WIDGETS[id].category));
        expect(ranks).toEqual([...ranks].sort((x, y) => x - y));
    });
});
