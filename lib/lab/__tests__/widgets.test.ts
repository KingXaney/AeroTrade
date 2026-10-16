// The game widgets Today may carry: a registry whose ids are the stored preference, each with a
// way in, an icon, a game for a round-ticked one and a site for an outside one, and a reader of a
// list of ids that drops what it does not know and keeps the registry's order.

import {describe, expect, it} from 'vitest';
import {DEFAULT_LAB_WIDGETS, LAB_WIDGET_IDS, LAB_WIDGETS, isLabWidgetId, labWidget, normalizeLabWidgets} from '@/lib/lab/widgets';
import {LAB_WIDGET_BLURBS, LAB_WIDGET_TITLES} from '@/lib/learn/copy/lab';
import {HIGHER_IS_RECORD} from '@/lib/games/rounds';

const GAME_IDS = Object.keys(HIGHER_IS_RECORD);

describe('the widget registry', () => {
    it('names every id once, with a way in, an icon, a game for a round-ticked one and a site for an outside one', () => {
        expect(LAB_WIDGETS.map((w) => w.id)).toEqual([...LAB_WIDGET_IDS]);
        for (const widget of LAB_WIDGETS) {
            expect(widget.href, widget.id).toMatch(/^(\/|https:\/\/)/);
            expect(widget.icon, widget.id).toMatch(/^[a-z_]+$/);
            if (widget.doneBy === 'round') expect(GAME_IDS, widget.id).toContain(widget.game);
            if (widget.kind === 'outside') expect(widget.site, widget.id).toBeDefined();
            if (widget.kind === 'outside') expect(widget.doneBy).toBe('manual');
            expect(LAB_WIDGET_TITLES[widget.id].length, widget.id).toBeGreaterThan(2);
            expect(LAB_WIDGET_BLURBS[widget.id].length, widget.id).toBeGreaterThan(10);
        }
        expect(labWidget('codeforces').href).toBe('https://codeforces.com/problemset');
        expect(labWidget('leetcode').site).toBe('leetcode');
        expect(DEFAULT_LAB_WIDGETS).toEqual(['daily-puzzle']);
    });

    it('reads a list of ids: unknown ids dropped, repeats folded, the registry order kept', () => {
        expect(normalizeLabWidgets(['leetcode', 'arithmetic', 'nope', 'arithmetic', 7, null])).toEqual(['arithmetic', 'leetcode']);
        expect(isLabWidgetId('kelly')).toBe(true);
        expect(isLabWidgetId('poker')).toBe(false);
    });
});
