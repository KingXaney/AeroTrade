// Today's layout: every part of the day and every game as a card, a stored layout read leniently
// (a stale id drops itself alone), a version-1 or version-2 layout and the older list of game ids
// read as the day as it comes with their games at the end, a default of the day on one screen, and
// editing helpers that never mutate and hand back the same reference for a no-op.

import {describe, expect, it} from 'vitest';
import {
    DEFAULT_LAB_LAYOUT,
    LAB_HUD,
    LAB_HUD_IDS,
    LAB_LAYOUT_VERSION,
    LAB_PANEL_IDS,
    LAB_SPANS,
    LabLayoutSchema,
    MAX_LAB_WIDGETS,
    addLabWidget,
    clampLabSpan,
    gamesOf,
    isLabHudId,
    isLabPanelId,
    isLabSpan,
    labLayoutFingerprint,
    labLayoutsEqual,
    layoutWithGames,
    missingLabWidgets,
    moveLabWidget,
    normalizeLabLayout,
    readLabLayout,
    removeLabWidget,
    resetLabLayout,
    setGameOn,
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
const DEFAULT_IDS = ['list', 'streak', 'unit', 'problem', 'review', 'progress', 'papers', 'daily-puzzle'];

describe('the catalog and the default', () => {
    it('lists every panel of the day and every game once, each with an icon and widths it allows', () => {
        expect(LAB_HUD_IDS).toEqual([...LAB_PANEL_IDS, ...LAB_WIDGET_IDS]);
        expect(MAX_LAB_WIDGETS).toBe(LAB_HUD_IDS.length);
        for (const id of LAB_HUD_IDS) {
            const def = LAB_HUD[id];
            expect(def.id).toBe(id);
            expect(def.icon).toMatch(/^[a-z_]+$/);
            expect(def.spans).toContain(def.defaultSpan);
            expect([...def.spans]).toEqual([...def.spans].sort((a, b) => a - b));
            expect(def.kind).toBe(isLabPanelId(id) ? 'panel' : 'game');
        }
        expect(Object.values(LAB_HUD).filter((d) => d.tall).map((d) => d.id)).toEqual(['list']);
        expect(LAB_SPANS).toEqual([4, 6, 8, 12]);
        expect(isLabSpan(6)).toBe(true);
        expect(isLabSpan(3)).toBe(false);
        expect(isLabHudId('list')).toBe(true);
        expect(isLabHudId('kelly')).toBe(true);
        expect(isLabHudId('nope')).toBe(false);
        expect(isLabPanelId('kelly')).toBe(false);
    });

    it('clamps to the nearest width the card allows, a tie to the smaller', () => {
        expect(clampLabSpan('kelly', 3)).toBe(4);
        expect(clampLabSpan('kelly', 5)).toBe(4);
        expect(clampLabSpan('kelly', 7)).toBe(6);
        expect(clampLabSpan('list', 4)).toBe(6);
        expect(clampLabSpan('list', 99)).toBe(12);
        expect(clampLabSpan('unit', 4)).toBe(4);
        expect(clampLabSpan('streak', 4)).toBe(4);
        expect(clampLabSpan('papers', 4)).toBe(4);
        expect(clampLabSpan('progress', 4)).toBe(6);
    });

    it('starts as the day on one screen, a fresh object each time', () => {
        expect(ids(DEFAULT_LAB_LAYOUT)).toEqual(DEFAULT_IDS);
        expect(DEFAULT_LAB_LAYOUT.widgets.map((w) => w.span)).toEqual([8, 4, 4, 12, 4, 8, 12, 4]);
        expect(resetLabLayout()).toEqual(DEFAULT_LAB_LAYOUT);
        expect(resetLabLayout()).not.toBe(resetLabLayout());
        expect(resetLabLayout().widgets[0]).not.toBe(DEFAULT_LAB_LAYOUT.widgets[0]);
    });
});

describe('reading what was stored', () => {
    it('keeps a sound layout, drops a stale id (a retired card too), folds a repeat, clamps a width, fills a missing one', () => {
        const read = normalizeLabLayout({version: 3, widgets: [
            {id: 'list', span: 8}, {id: 'nope', span: 4}, {id: 'check-in', span: 12}, {id: 'reflection', span: 12}, {id: 'list', span: 4}, {id: 'lichess', span: 5}, {id: 'unit'}, 'junk', {span: 4}, {id: 'streak', span: 4}, {id: 'progress', span: 4},
        ]});
        expect(read).toEqual({version: 3, widgets: [{id: 'list', span: 8}, {id: 'lichess', span: 4}, {id: 'unit', span: 4}, {id: 'streak', span: 4}, {id: 'progress', span: 6}]});
    });

    it('reads the morning\'s version 1 — the games alone — into the games slot of the day as it comes, at the default width', () => {
        const read = normalizeLabLayout({version: 1, widgets: [{id: 'arithmetic', span: 8}, {id: 'daily-puzzle', span: 6}, {id: 'list', span: 12}]});
        expect(ids(read)).toEqual(['list', 'streak', 'unit', 'problem', 'review', 'progress', 'papers', 'arithmetic', 'daily-puzzle']);
        expect(read.widgets.find((w) => w.id === 'arithmetic')?.span).toBe(4);
        expect(ids(normalizeLabLayout({version: 1, widgets: []}))).toEqual(DEFAULT_IDS.filter((id) => id !== 'daily-puzzle'));
    });

    it('reads the afternoon\'s version 2 the same way: its arrangement replaced, its games kept at the end', () => {
        const read = normalizeLabLayout({version: 2, widgets: [{id: 'streak', span: 12}, {id: 'arithmetic', span: 8}, {id: 'list', span: 12}, {id: 'daily-puzzle', span: 6}, {id: 'progress', span: 12}]});
        expect(ids(read)).toEqual(['list', 'streak', 'unit', 'problem', 'review', 'progress', 'papers', 'arithmetic', 'daily-puzzle']);
        expect(read.widgets.map((w) => w.span)).toEqual([8, 4, 4, 12, 4, 8, 12, 4, 4]);
        expect(ids(normalizeLabLayout({version: 2, widgets: []}))).toEqual(DEFAULT_IDS.filter((id) => id !== 'daily-puzzle'));
    });

    it('resets on an unknown version or no shape at all, and keeps an empty layout empty', () => {
        expect(normalizeLabLayout({version: 4, widgets: [{id: 'list', span: 8}]})).toEqual(resetLabLayout());
        expect(normalizeLabLayout('nonsense')).toEqual(resetLabLayout());
        expect(normalizeLabLayout(null)).toEqual(resetLabLayout());
        expect(normalizeLabLayout({version: 3, widgets: []})).toEqual({version: 3, widgets: []});
    });

    it('caps at every card once', () => {
        const twice = [...LAB_HUD_IDS, ...LAB_HUD_IDS].map((id) => ({id, span: 6}));
        expect(normalizeLabLayout({version: 3, widgets: twice}).widgets).toHaveLength(MAX_LAB_WIDGETS);
    });

    it('prefers the layout to the old list, the old list to nothing, and nothing is the default', () => {
        expect(ids(readLabLayout({labLayout: {version: 3, widgets: [{id: 'kelly', span: 12}]}, labWidgets: ['arithmetic']}))).toEqual(['kelly']);
        expect(ids(readLabLayout({labWidgets: ['monkeytype', 'daily-puzzle']}))).toEqual(['list', 'streak', 'unit', 'problem', 'review', 'progress', 'papers', 'daily-puzzle', 'monkeytype']);
        // An empty old list meant "no games", and still does.
        expect(ids(readLabLayout({labWidgets: []}))).toEqual(DEFAULT_IDS.filter((id) => id !== 'daily-puzzle'));
        expect(readLabLayout({})).toEqual(resetLabLayout());
        expect(readLabLayout(undefined)).toEqual(resetLabLayout());
        expect(readLabLayout(null)).toEqual(resetLabLayout());
        expect(gamesOf(readLabLayout({labLayout: null, labWidgets: ['kelly']}))).toEqual(['kelly']);
        expect(layoutWithGames([]).widgets.every((w) => isLabPanelId(w.id))).toBe(true);
    });

    it('refuses what the arranging view must not send: a stray key, a width off the scale, an unknown id, the old version', () => {
        expect(LabLayoutSchema.safeParse({version: 3, widgets: [{id: 'kelly', span: 8}, {id: 'list', span: 12}]}).success).toBe(true);
        expect(LabLayoutSchema.safeParse({version: 3, widgets: [{id: 'kelly', span: 5}]}).success).toBe(false);
        expect(LabLayoutSchema.safeParse({version: 3, widgets: [{id: 'nope', span: 4}]}).success).toBe(false);
        expect(LabLayoutSchema.safeParse({version: 3, widgets: [{id: 'kelly', span: 4, extra: 1}]}).success).toBe(false);
        expect(LabLayoutSchema.safeParse({version: 3, widgets: [], extra: true}).success).toBe(false);
        expect(LabLayoutSchema.safeParse({version: 2, widgets: []}).success).toBe(false);
        expect(LabLayoutSchema.safeParse({version: 1, widgets: []}).success).toBe(false);
    });
});

describe('editing', () => {
    const base = layout([{id: 'list', span: 12}, {id: 'daily-puzzle', span: 6}, {id: 'arithmetic', span: 6}, {id: 'lichess', span: 4}]);

    it('moves a card, and is a no-op out of range or in place', () => {
        expect(ids(moveLabWidget(base, 3, 0))).toEqual(['lichess', 'list', 'daily-puzzle', 'arithmetic']);
        expect(ids(moveLabWidget(base, 0, 3))).toEqual(['daily-puzzle', 'arithmetic', 'lichess', 'list']);
        expect(moveLabWidget(base, 1, 1)).toBe(base);
        expect(moveLabWidget(base, 0, 4)).toBe(base);
        expect(moveLabWidget(base, -1, 0)).toBe(base);
        expect(moveLabWidget(base, 0.5, 1)).toBe(base);
    });

    it('adds at the card\'s default width, or a clamped one, never twice, never past the cap', () => {
        expect(addLabWidget(base, 'kelly').widgets.at(-1)).toEqual({id: 'kelly', span: 4});
        expect(addLabWidget(base, 'streak').widgets.at(-1)).toEqual({id: 'streak', span: 4});
        expect(addLabWidget(base, 'kelly', 12).widgets.at(-1)).toEqual({id: 'kelly', span: 12});
        expect(addLabWidget(base, 'progress', 4).widgets.at(-1)).toEqual({id: 'progress', span: 6});
        expect(addLabWidget(base, 'arithmetic')).toBe(base);
        expect(addLabWidget(base, 'nope' as never)).toBe(base);
        const full = {version: LAB_LAYOUT_VERSION, widgets: LAB_HUD_IDS.map((id) => ({id, span: LAB_HUD[id].defaultSpan}))} as LabLayout;
        expect(addLabWidget(full, 'kelly')).toBe(full);
    });

    it('removes a card, and is a no-op for one not on the page', () => {
        expect(ids(removeLabWidget(base, 'arithmetic'))).toEqual(['list', 'daily-puzzle', 'lichess']);
        expect(removeLabWidget(base, 'kelly')).toBe(base);
    });

    it('switches a game on at the end of the page, and off', () => {
        expect(ids(setGameOn(base, 'kelly', true))).toEqual(['list', 'daily-puzzle', 'arithmetic', 'lichess', 'kelly']);
        expect(setGameOn(base, 'kelly', false)).toBe(base);
        expect(ids(setGameOn(base, 'lichess', false))).toEqual(['list', 'daily-puzzle', 'arithmetic']);
        expect(setGameOn(base, 'lichess', true)).toBe(base);
        expect(gamesOf(base)).toEqual(['daily-puzzle', 'arithmetic', 'lichess']);
    });

    it('sets a width, clamped to the card, and is a no-op when it does not change', () => {
        expect(setLabSpan(base, 'lichess', 12).widgets[3]).toEqual({id: 'lichess', span: 12});
        expect(setLabSpan(base, 'lichess', 7).widgets[3]).toEqual({id: 'lichess', span: 6});
        expect(setLabSpan(base, 'list', 4).widgets[0]).toEqual({id: 'list', span: 6});
        expect(setLabSpan(base, 'lichess', 4)).toBe(base);
        expect(setLabSpan(base, 'kelly', 4)).toBe(base);
        // The untouched items keep their identity.
        expect(setLabSpan(base, 'lichess', 12).widgets[0]).toBe(base.widgets[0]);
    });

    it('compares and fingerprints by order and width', () => {
        expect(labLayoutsEqual(base, layout([{id: 'list', span: 12}, {id: 'daily-puzzle', span: 6}, {id: 'arithmetic', span: 6}, {id: 'lichess', span: 4}]))).toBe(true);
        expect(labLayoutsEqual(base, setLabSpan(base, 'lichess', 8))).toBe(false);
        expect(labLayoutsEqual(base, moveLabWidget(base, 0, 1))).toBe(false);
        expect(labLayoutFingerprint(base)).toBe('v3:list@12,daily-puzzle@6,arithmetic@6,lichess@4');
        expect(labLayoutFingerprint(layout([]))).toBe('v3:');
    });

    it('lists what is not yet on the page in the registry order, the panels first', () => {
        expect(missingLabWidgets(base)).toEqual(['streak', 'unit', 'review', 'problem', 'papers', 'progress', 'kelly', 'market-making', 'correlation', 'poker-night', 'monkeytype', 'codeforces', 'leetcode']);
        expect(missingLabWidgets(resetLabLayout())).toEqual(LAB_WIDGET_IDS.filter((id) => id !== 'daily-puzzle'));
    });
});
