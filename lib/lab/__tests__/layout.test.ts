// The game widgets' layout on Lab › Today: a stored layout read leniently (a stale id drops itself
// alone), the older list of ids read as one, a default of the puzzle alone, and editing helpers
// that never mutate and hand back the same reference for a no-op.

import {describe, expect, it} from 'vitest';
import {
    DEFAULT_LAB_SPAN,
    LAB_LAYOUT_VERSION,
    LAB_SPANS,
    LabLayoutSchema,
    MAX_LAB_WIDGETS,
    addLabWidget,
    clampLabSpan,
    isLabSpan,
    labLayoutFingerprint,
    labLayoutsEqual,
    layoutFromIds,
    missingLabWidgets,
    moveLabWidget,
    normalizeLabLayout,
    readLabLayout,
    removeLabWidget,
    resetLabLayout,
    setLabSpan,
    type LabLayout,
    type LabLayoutItem,
} from '@/lib/lab/layout';
import {LAB_WIDGET_IDS} from '@/lib/lab/widgets';

// Frozen inputs turn any accidental mutation into a TypeError (modules are strict).
const layout = (widgets: LabLayoutItem[]): LabLayout => {
    widgets.forEach((w) => Object.freeze(w));
    Object.freeze(widgets);
    return Object.freeze({version: LAB_LAYOUT_VERSION, widgets}) as LabLayout;
};
const ids = (l: LabLayout) => l.widgets.map((w) => w.id);

describe('the scale and the default', () => {
    it('offers four widths of twelve columns, the default a half', () => {
        expect(LAB_SPANS).toEqual([4, 6, 8, 12]);
        expect(DEFAULT_LAB_SPAN).toBe(6);
        expect(MAX_LAB_WIDGETS).toBe(LAB_WIDGET_IDS.length);
        expect(isLabSpan(6)).toBe(true);
        expect(isLabSpan(3)).toBe(false);
        expect(isLabSpan('6')).toBe(false);
    });

    it('clamps to the nearest width, a tie to the smaller', () => {
        expect(clampLabSpan(3)).toBe(4);
        expect(clampLabSpan(5)).toBe(4);
        expect(clampLabSpan(7)).toBe(6);
        expect(clampLabSpan(10)).toBe(8);
        expect(clampLabSpan(99)).toBe(12);
        expect(clampLabSpan(-1)).toBe(4);
    });

    it('starts as the puzzle alone, a fresh object each time', () => {
        expect(resetLabLayout()).toEqual({version: 1, widgets: [{id: 'daily-puzzle', span: 6}]});
        expect(resetLabLayout()).not.toBe(resetLabLayout());
        expect(resetLabLayout().widgets[0]).not.toBe(resetLabLayout().widgets[0]);
    });
});

describe('reading what was stored', () => {
    it('keeps a sound layout, drops a stale id, folds a repeat, clamps a span, fills a missing one', () => {
        const read = normalizeLabLayout({version: 1, widgets: [
            {id: 'kelly', span: 8}, {id: 'nope', span: 4}, {id: 'kelly', span: 4}, {id: 'lichess', span: 5}, {id: 'arithmetic'}, 'junk', {span: 4},
        ]});
        expect(read).toEqual({version: 1, widgets: [{id: 'kelly', span: 8}, {id: 'lichess', span: 4}, {id: 'arithmetic', span: 6}]});
    });

    it('resets on the wrong version or no shape at all, and keeps an empty layout empty', () => {
        expect(normalizeLabLayout({version: 2, widgets: [{id: 'kelly', span: 8}]})).toEqual(resetLabLayout());
        expect(normalizeLabLayout('nonsense')).toEqual(resetLabLayout());
        expect(normalizeLabLayout(null)).toEqual(resetLabLayout());
        expect(normalizeLabLayout({version: 1, widgets: []})).toEqual({version: 1, widgets: []});
    });

    it('caps at every widget once', () => {
        const twice = [...LAB_WIDGET_IDS, ...LAB_WIDGET_IDS].map((id) => ({id, span: 4}));
        expect(normalizeLabLayout({version: 1, widgets: twice}).widgets).toHaveLength(MAX_LAB_WIDGETS);
    });

    it('reads a list of ids at the default width, in the registry order, unknown ones dropped', () => {
        expect(layoutFromIds(['leetcode', 'arithmetic', 'nope', 'arithmetic', 7])).toEqual({version: 1, widgets: [{id: 'arithmetic', span: 6}, {id: 'leetcode', span: 6}]});
        expect(layoutFromIds([])).toEqual({version: 1, widgets: []});
    });

    it('prefers the layout to the old list, the old list to nothing, and nothing is the default', () => {
        expect(readLabLayout({labLayout: {version: 1, widgets: [{id: 'kelly', span: 12}]}, labWidgets: ['arithmetic']})).toEqual({version: 1, widgets: [{id: 'kelly', span: 12}]});
        expect(readLabLayout({labWidgets: ['monkeytype', 'daily-puzzle']})).toEqual({version: 1, widgets: [{id: 'daily-puzzle', span: 6}, {id: 'monkeytype', span: 6}]});
        // An empty old list meant "none", and still does.
        expect(readLabLayout({labWidgets: []})).toEqual({version: 1, widgets: []});
        expect(readLabLayout({})).toEqual(resetLabLayout());
        expect(readLabLayout(undefined)).toEqual(resetLabLayout());
        expect(readLabLayout(null)).toEqual(resetLabLayout());
        expect(readLabLayout({labLayout: null, labWidgets: ['kelly']})).toEqual({version: 1, widgets: [{id: 'kelly', span: 6}]});
    });

    it('refuses what the arranging view must not send: a stray key, a span off the scale, an unknown id', () => {
        expect(LabLayoutSchema.safeParse({version: 1, widgets: [{id: 'kelly', span: 8}]}).success).toBe(true);
        expect(LabLayoutSchema.safeParse({version: 1, widgets: [{id: 'kelly', span: 5}]}).success).toBe(false);
        expect(LabLayoutSchema.safeParse({version: 1, widgets: [{id: 'nope', span: 4}]}).success).toBe(false);
        expect(LabLayoutSchema.safeParse({version: 1, widgets: [{id: 'kelly', span: 4, extra: 1}]}).success).toBe(false);
        expect(LabLayoutSchema.safeParse({version: 1, widgets: [], extra: true}).success).toBe(false);
        expect(LabLayoutSchema.safeParse({version: 2, widgets: []}).success).toBe(false);
    });
});

describe('editing', () => {
    const base = layout([{id: 'daily-puzzle', span: 6}, {id: 'arithmetic', span: 6}, {id: 'lichess', span: 4}]);

    it('moves a widget, and is a no-op out of range or in place', () => {
        expect(ids(moveLabWidget(base, 2, 0))).toEqual(['lichess', 'daily-puzzle', 'arithmetic']);
        expect(ids(moveLabWidget(base, 0, 2))).toEqual(['arithmetic', 'lichess', 'daily-puzzle']);
        expect(moveLabWidget(base, 1, 1)).toBe(base);
        expect(moveLabWidget(base, 0, 3)).toBe(base);
        expect(moveLabWidget(base, -1, 0)).toBe(base);
        expect(moveLabWidget(base, 0.5, 1)).toBe(base);
    });

    it('adds at the default width, or a clamped one, never twice, never past the cap', () => {
        expect(addLabWidget(base, 'kelly').widgets.at(-1)).toEqual({id: 'kelly', span: 6});
        expect(addLabWidget(base, 'kelly', 12).widgets.at(-1)).toEqual({id: 'kelly', span: 12});
        expect(addLabWidget(base, 'arithmetic')).toBe(base);
        expect(addLabWidget(base, 'nope' as never)).toBe(base);
        const full = layoutFromIds([...LAB_WIDGET_IDS]);
        expect(addLabWidget(full, 'kelly')).toBe(full);
    });

    it('removes a widget, and is a no-op for one not on the page', () => {
        expect(ids(removeLabWidget(base, 'arithmetic'))).toEqual(['daily-puzzle', 'lichess']);
        expect(removeLabWidget(base, 'kelly')).toBe(base);
    });

    it('sets a width, clamped, and is a no-op when it does not change', () => {
        expect(setLabSpan(base, 'lichess', 12).widgets[2]).toEqual({id: 'lichess', span: 12});
        expect(setLabSpan(base, 'lichess', 7).widgets[2]).toEqual({id: 'lichess', span: 6});
        expect(setLabSpan(base, 'lichess', 4)).toBe(base);
        expect(setLabSpan(base, 'kelly', 4)).toBe(base);
        // The untouched items keep their identity.
        expect(setLabSpan(base, 'lichess', 12).widgets[0]).toBe(base.widgets[0]);
    });

    it('compares and fingerprints by order and width', () => {
        expect(labLayoutsEqual(base, layout([{id: 'daily-puzzle', span: 6}, {id: 'arithmetic', span: 6}, {id: 'lichess', span: 4}]))).toBe(true);
        expect(labLayoutsEqual(base, setLabSpan(base, 'lichess', 8))).toBe(false);
        expect(labLayoutsEqual(base, moveLabWidget(base, 0, 1))).toBe(false);
        expect(labLayoutFingerprint(base)).toBe('v1:daily-puzzle@6,arithmetic@6,lichess@4');
        expect(labLayoutFingerprint(layout([]))).toBe('v1:');
    });

    it('lists what is not yet on the page in the registry order', () => {
        expect(missingLabWidgets(base)).toEqual(['kelly', 'market-making', 'correlation', 'poker-night', 'monkeytype', 'codeforces', 'leetcode']);
        expect(missingLabWidgets(layoutFromIds([...LAB_WIDGET_IDS]))).toEqual([]);
    });
});
